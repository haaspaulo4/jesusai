const { pool } = require('../db');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');

async function generateSuggestions(personaId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const suggestions = [];
  const data = { persona_id: personaId, period_days: days, total_messages: 0, suggestions };

  const [messages] = await pool.execute(
    'SELECT COUNT(*) as total FROM persona_messages WHERE persona_id = ? AND created_at >= ?',
    [personaId, since]
  );

  const [cognitiveStates] = await pool.execute(
    `SELECT emotion, COUNT(*) as count, AVG(churn_risk) as avg_churn, AVG(conversion_probability) as avg_conversion, AVG(engagement_score) as avg_engagement
     FROM cognitive_states WHERE persona_id = ? AND created_at >= ? GROUP BY emotion ORDER BY count DESC LIMIT 5`,
    [personaId, since]
  );

  const [toolUsage] = await pool.execute(
    'SELECT tool_calls FROM persona_messages WHERE persona_id = ? AND tool_calls IS NOT NULL AND created_at >= ? LIMIT 50',
    [personaId, since]
  );

  const [overrides] = await pool.execute(
    'SELECT COUNT(*) as total FROM human_overrides WHERE persona_id = ? AND is_active = 1',
    [personaId]
  );

  const [goals] = await pool.execute(
    "SELECT status, COUNT(*) as count, AVG(progress) as avg_progress FROM persona_goals WHERE persona_id = ? GROUP BY status",
    [personaId]
  );

  const [automations] = await pool.execute(
    'SELECT COUNT(*) as total, SUM(run_count) as total_runs FROM persona_automations WHERE persona_id = ? AND is_active = 1',
    [personaId]
  );

  const toolCounts = {};
  for (const row of toolUsage) {
    try {
      const calls = typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls;
      if (Array.isArray(calls)) {
        for (const call of calls) {
          const name = call.function?.name || call.name || 'unknown';
          toolCounts[name] = (toolCounts[name] || 0) + 1;
        }
      }
    } catch {}
  }

  if (cognitiveStates.length > 0) {
    const topEmotion = cognitiveStates[0];
    const totalMessages = messages.length > 0 ? (messages[0].total || 1) : 1;
    if (topEmotion.emotion === 'frustrated' || topEmotion.emotion === 'angry') {
      suggestions.push({
        type: 'tone_adjustment',
        priority: 'high',
        title: 'Ajustar tom para mais empático',
        description: `${Math.round((topEmotion.count / totalMessages) * 100)}% das mensagens têm emoção "${topEmotion.emotion}". Considere tornar a persona mais acolhedora e paciente.`,
        data: { emotion: topEmotion.emotion, percentage: Math.round((topEmotion.count / totalMessages) * 100) },
      });
    }

    const avgChurn = cognitiveStates.reduce((s, r) => s + (r.avg_churn || 0), 0) / cognitiveStates.length;
    if (avgChurn > 0.5) {
      suggestions.push({
        type: 'retention',
        priority: 'high',
        title: 'Risco de churn elevado',
        description: `Risco médio de churn: ${Math.round(avgChurn * 100)}%. Implementar follow-ups proativos e mensagens de reengajamento.`,
        data: { avgChurnRisk: Math.round(avgChurn * 100) },
      });
    }

    const avgEngagement = cognitiveStates.reduce((s, r) => s + (r.avg_engagement || 0), 0) / cognitiveStates.length;
    if (avgEngagement < 0.4) {
      suggestions.push({
        type: 'engagement',
        priority: 'medium',
        title: 'Engajamento baixo',
        description: `Score médio de engajamento: ${Math.round(avgEngagement * 100)}%. Considere gamificação, follow-ups mais curtos, ou conteúdo mais interativo.`,
        data: { avgEngagement: Math.round(avgEngagement * 100) },
      });
    }
  }

  if (Object.keys(toolCounts).length > 0) {
    const mostUsed = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])[0];
    suggestions.push({
      type: 'tool_usage',
      priority: 'low',
      title: `Ferramenta mais usada: ${mostUsed[0]}`,
      description: `${mostUsed[0]} foi usada ${mostUsed[1]}x nos últimos ${days} dias. Considere criar uma skill dedicada para otimizar.`,
      data: { tool: mostUsed[0], count: mostUsed[1] },
    });
  }

  const completedGoals = goals.find(g => g.status === 'completed');
  const activeGoals = goals.find(g => g.status === 'active');
  if (activeGoals && activeGoals.count > 5 && (!completedGoals || completedGoals.count < activeGoals.count * 0.2)) {
    suggestions.push({
      type: 'goals',
      priority: 'medium',
      title: 'Muitas metas ativas, poucas completadas',
      description: `${activeGoals.count} metas ativas mas baixa taxa de conclusão. Considere simplificar objetivos e focar em menos metas por vez.`,
      data: { activeGoals: activeGoals.count, completedGoals: completedGoals?.count || 0 },
    });
  }

  const totalAutoRuns = automations[0]?.total_runs || 0;
  if (totalAutoRuns === 0 && (messages[0]?.total || 0) > 20) {
    suggestions.push({
      type: 'automation',
      priority: 'medium',
      title: 'Nenhuma automação está ativa',
      description: `${messages[0]?.total || 0} mensagens mas sem automações. Considere criar follow-ups automáticos.`,
      data: { totalMessages: messages[0]?.total || 0 },
    });
  }

  if (overrides[0]?.total > 3) {
    suggestions.push({
      type: 'override',
      priority: 'high',
      title: 'Muitas intervenções humanas',
      description: `${overrides[0].total} overrides ativos. A IA pode estar precisando de ajuste fino de personalidade ou regras.`,
      data: { overrideCount: overrides[0].total },
    });
  }

  data.total_messages = messages.length > 0 ? (messages[0].total || 0) : 0;
  data.suggestions = suggestions;
  return data;
}

module.exports = { generateSuggestions };