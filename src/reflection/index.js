const { pool } = require('../db');
const integrations = require('../llm/integrationManager');
const { getSetting } = require('../settings');
const personaManager = require('../persona/manager');
const thoughtsModule = require('../thoughts');
const cognitiveModule = require('../cognitive');
const goalsModule = require('../goals');
const gamificationModule = require('../gamification');

async function analyzePersonaPerformance(personaId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');

  const [thoughtRows] = await pool.execute(
    'SELECT tools_used, context_injected, reasoning, decision, response_time_ms, tokens_used FROM agent_thoughts WHERE persona_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 100',
    [personaId, since]
  );

  const [cogRows] = await pool.execute(
    'SELECT emotion, intent, churn_risk, conversion_probability, engagement_score FROM cognitive_states WHERE persona_id = ? AND created_at >= ?',
    [personaId, since]
  );

  const [msgRows] = await pool.execute(
    'SELECT COUNT(*) as total, DATE(created_at) as date FROM persona_messages WHERE persona_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY date',
    [personaId, since]
  );

  const emotionDist = {};
  const intentDist = {};
  let avgChurnRisk = 0;
  let avgConversion = 0;
  let avgEngagement = 0;

  for (const row of cogRows) {
    emotionDist[row.emotion] = (emotionDist[row.emotion] || 0) + 1;
    intentDist[row.intent] = (intentDist[row.intent] || 0) + 1;
    avgChurnRisk += row.churn_risk || 0;
    avgConversion += row.conversion_probability || 0;
    avgEngagement += row.engagement_score || 0;
  }

  const cogCount = cogRows.length || 1;
  avgChurnRisk = Math.round((avgChurnRisk / cogCount) * 100) / 100;
  avgConversion = Math.round((avgConversion / cogCount) * 100) / 100;
  avgEngagement = Math.round((avgEngagement / cogCount) * 100) / 100;

  const toolUsage = {};
  let avgResponseTime = 0;
  let avgTokens = 0;
  for (const row of thoughtRows) {
    let tools = row.tools_used;
    if (typeof tools === 'string') { try { tools = JSON.parse(tools); } catch { tools = []; } }
    for (const t of (tools || [])) {
      toolUsage[t] = (toolUsage[t] || 0) + 1;
    }
    avgResponseTime += row.response_time_ms || 0;
    avgTokens += row.tokens_used || 0;
  }
  const thoughtCount = thoughtRows.length || 1;
  avgResponseTime = Math.round(avgResponseTime / thoughtCount);
  avgTokens = Math.round(avgTokens / thoughtCount);

  const totalMessages = msgRows.reduce((sum, r) => sum + r.total, 0);

  return {
    personaId,
    period: `${days} days`,
    totalMessages,
    totalThoughts: thoughtRows.length,
    totalCognitiveStates: cogRows.length,
    emotions: emotionDist,
    intents: intentDist,
    avgChurnRisk,
    avgConversionProbability: avgConversion,
    avgEngagementScore: avgEngagement,
    toolUsage,
    avgResponseTime,
    avgTokens,
  };
}

async function generateReflection(personaId, days = 7) {
  const stats = await analyzePersonaPerformance(personaId, days);

  const persona = await personaManager.getPersona(personaId);
  const personaName = persona ? persona.name : personaId;

  const topEmotion = Object.entries(stats.emotions).sort((a, b) => b[1] - a[1])[0];
  const topIntent = Object.entries(stats.intents).sort((a, b) => b[1] - a[1])[0];
  const topTool = Object.entries(stats.toolUsage).sort((a, b) => b[1] - a[1])[0];

  const reflections = [];

  if (topEmotion) {
    const [emotion, count] = topEmotion;
    const pct = Math.round((count / stats.totalCognitiveStates) * 100);
    if (['frustrated', 'angry', 'sad'].includes(emotion) && pct > 30) {
      reflections.push({
        type: 'tone',
        priority: 'high',
        title: `Dominant negative emotion: ${emotion} (${pct}%)`,
        description: `Users show frequent ${emotion} responses. Consider adjusting tone to be more empathetic, patient, and supportive. Add calming phrases and acknowledge frustration before providing solutions.`,
        data: { emotion, percentage: pct },
      });
    }
    if (emotion === 'confused' && pct > 25) {
      reflections.push({
        type: 'clarity',
        priority: 'medium',
        title: `High confusion rate: ${pct}%`,
        description: `Users frequently seem confused. Consider simplifying explanations, using step-by-step responses, and adding examples or analogies.`,
        data: { emotion, percentage: pct },
      });
    }
  }

  if (stats.avgChurnRisk > 0.5) {
    reflections.push({
      type: 'retention',
      priority: 'high',
      title: `High churn risk: ${Math.round(stats.avgChurnRisk * 100)}%`,
      description: `Average churn risk is elevated. Implement proactive follow-ups, personalize responses more, and address concerns faster.`,
      data: { churnRisk: stats.avgChurnRisk },
    });
  }

  if (stats.avgEngagementScore < 0.4) {
    reflections.push({
      type: 'engagement',
      priority: 'medium',
      title: `Low engagement: ${Math.round(stats.avgEngagementScore * 100)}%`,
      description: `Engagement scores are low. Consider adding interactive elements, questions, gamification, and varied response formats.`,
      data: { engagement: stats.avgEngagementScore },
    });
  }

  if (topIntent && topIntent[0] === 'purchase' && stats.avgConversionProbability < 0.3) {
    reflections.push({
      type: 'conversion',
      priority: 'medium',
      title: `Purchase intent but low conversion (${Math.round(stats.avgConversionProbability * 100)}%)`,
      description: `Users show purchase intent but aren't converting. Add clearer calls-to-action, address objections proactively, and simplify next steps.`,
      data: { conversion: stats.avgConversionProbability },
    });
  }

  if (topTool) {
    reflections.push({
      type: 'skill',
      priority: 'low',
      title: `Most-used tool: ${topTool[0]} (${topTool[1]}x)`,
      description: `Consider creating a dedicated skill for this frequent action type to improve response quality and consistency.`,
      data: { tool: topTool[0], count: topTool[1] },
    });
  }

  try {
    const goalProgress = await goalsModule.getGoalProgress(personaId);
    const activeGoals = goalProgress.byStatus?.active;
    const completedGoals = goalProgress.byStatus?.completed;
    if (activeGoals && completedGoals && activeGoals.count > completedGoals.count * 3) {
      reflections.push({
        type: 'goals',
        priority: 'medium',
        title: 'Too many active goals vs completed',
        description: `There are ${activeGoals.count} active goals but only ${completedGoals.count} completed. Consider simplifying objectives, breaking large goals into smaller ones, or adjusting expectations.`,
        data: { activeGoals: activeGoals.count, completedGoals: completedGoals.count },
      });
    }
  } catch {}

  if (stats.avgResponseTime > 5000) {
    reflections.push({
      type: 'performance',
      priority: 'low',
      title: `High response time: ${stats.avgResponseTime}ms`,
      description: `Average response time is above 5 seconds. Consider optimizing tool calls, reducing context size, or caching frequent responses.`,
      data: { avgResponseTime: stats.avgResponseTime },
    });
  }

  return {
    personaId,
    personaName,
    period: `${days} days`,
    stats,
    reflections,
    reflectionCount: reflections.length,
  };
}

async function autoAdjustPersona(personaId, days = 7) {
  const reflection = await generateReflection(personaId, days);

  if (reflection.reflections.length === 0) {
    return { personaId, adjusted: false, reason: 'No significant issues found' };
  }

  const highPriority = reflection.reflections.filter(r => r.priority === 'high');
  if (highPriority.length === 0) {
    return { personaId, adjusted: false, reason: 'Only low/medium priority issues found', reflections: reflection.reflections };
  }

  const persona = await personaManager.getPersona(personaId);
  if (!persona) {
    return { personaId, adjusted: false, reason: 'Persona not found' };
  }

  const adjustmentPrompt = `You are a persona optimization engine. Based on the following analysis, suggest EXACT JSON adjustments to the persona's configuration.

CURRENT PERSONA: ${persona.name}
ANALYSIS PERIOD: ${reflection.period}

ISSUES FOUND:
${reflection.reflections.map((r, i) => `${i + 1}. [${r.priority.toUpperCase()}] ${r.title}: ${r.description}`).join('\n')}

CURRENT IDENTITY (pt-BR): ${typeof persona.identity === 'object' ? (persona.identity['pt-BR']?.core || '').substring(0, 500) : String(persona.identity).substring(0, 500)}

Respond with ONLY a JSON object with suggested adjustments:
{
  "tone_adjustment": "Brief description of tone adjustment",
  "rules_to_add": ["rule1", "rule2"],
  "rules_to_modify": { "old_rule_pattern": "new_rule" },
  "context_weight_change": "How to change context weighting",
  "response_style_change": "Brief description of style change",
  "priority": "high/medium/low"
}

Keep adjustments minimal and specific. Only suggest changes that directly address the identified issues.`;

  try {
    const maxTokens = parseInt(await getSetting('max_tokens', '2048')) || 2048;
    const result = await integrations.callLLM(
      [{ role: 'system', content: adjustmentPrompt }],
      { stream: false, temperature: 0.3, numPredict: maxTokens, retries: 1, timeout: 30000 }
    );

    const content = result.content || result.choices?.[0]?.message?.content || '';
    let cleaned = content.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    let suggestions;
    try {
      suggestions = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) suggestions = JSON.parse(jsonMatch[0]);
      else suggestions = { raw: cleaned };
    }

    const events = require('../events');
    await events.emit('on_cognitive_change', {
      userId: 'system',
      personaId,
      previousEmotion: 'reflection',
      newEmotion: 'adjusted',
      reflection: reflection.reflections.map(r => r.title).join(', '),
    });

    return {
      personaId,
      adjusted: false,
      autoApplied: false,
      suggestions,
      reflections: reflection.reflections,
      stats: reflection.stats,
    };
  } catch (err) {
    console.error('[SelfReflection] LLM adjustment failed:', err.message);
    return {
      personaId,
      adjusted: false,
      reason: `LLM call failed: ${err.message}`,
      reflections: reflection.reflections,
    };
  }
}

module.exports = {
  analyzePersonaPerformance,
  generateReflection,
  autoAdjustPersona,
};