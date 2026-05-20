const { pool } = require('../db');

async function getInactiveCustomers(personaId, daysInactive = 7) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.phone, MAX(pm.created_at) as last_message, DATEDIFF(NOW(), MAX(pm.created_at)) as days_inactive
     FROM users u
     JOIN persona_messages pm ON u.id = pm.user_id
     WHERE pm.persona_id = ?
     AND pm.role = 'user'
     GROUP BY u.id
     HAVING days_inactive >= ?
     ORDER BY days_inactive DESC`,
    [personaId, daysInactive]
  );
  return rows;
}

async function getChurnRiskCustomers(personaId) {
  const [rows] = await pool.execute(
    `SELECT cs.user_id, cs.emotion, cs.churn_risk, cs.engagement_score, cs.suggested_action, u.name, u.phone
     FROM cognitive_states cs
     JOIN users u ON cs.user_id = u.id
     WHERE cs.persona_id = ?
     AND cs.churn_risk > 0.5
     AND cs.id = (SELECT MAX(id) FROM cognitive_states WHERE user_id = cs.user_id AND persona_id = ?)
     ORDER BY cs.churn_risk DESC`,
    [personaId, personaId]
  );
  return rows;
}

async function getAtRiskCustomers(personaId) {
  const [inactive7] = await pool.execute(
    `SELECT COUNT(DISTINCT user_id) as count FROM persona_messages WHERE persona_id = ? AND role = 'user' AND user_id NOT IN (
       SELECT DISTINCT user_id FROM persona_messages WHERE persona_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ) AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [personaId, personaId]
  );
  const [churnRisk] = await pool.execute(
    'SELECT COUNT(DISTINCT user_id) as count FROM cognitive_states WHERE persona_id = ? AND churn_risk > 0.5 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
    [personaId]
  );
  const [lowEngagement] = await pool.execute(
    'SELECT COUNT(DISTINCT user_id) as count FROM cognitive_states WHERE persona_id = ? AND engagement_score < 0.3 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)',
    [personaId]
  );
  return {
    inactive_7d: inactive7[0].count || 0,
    high_churn_risk: churnRisk[0].count || 0,
    low_engagement: lowEngagement[0].count || 0,
  };
}

async function createRecoveryAutomation(personaId, config) {
  const id = `ra_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await pool.execute(
    'INSERT INTO persona_automations (id, persona_id, owner_id, name, description, trigger_type, trigger_config, action_type, action_config, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
    [id, personaId, config.owner_id || 'system', config.name, config.description || 'Recuperação automática de clientes', config.trigger_type || 'interval_messages', JSON.stringify(config.trigger_config || { every_n: 7 }), config.action_type || 'message', JSON.stringify(config.action_config || { message: config.message })]
  );
  return { id, ...config };
}

async function seedRecoveryAutomations(personaId) {
  const automations = [
    {
      name: 'Recuperação 7 dias',
      description: 'Mensagem automática para clientes inativos por 7 dias',
      trigger_type: 'interval_messages',
      trigger_config: { every_n: 7, target: 'inactive' },
      action_type: 'message',
      action_config: { message: 'Oi! Sentimos sua falta 😊 Que tal voltar? Temos novidades especiais pra você!' },
    },
    {
      name: 'Recuperação 15 dias',
      description: 'Mensagem automática para clientes inativos por 15 dias',
      trigger_type: 'interval_messages',
      trigger_config: { every_n: 15, target: 'inactive' },
      action_type: 'message',
      action_config: { message: 'Estamos com saudades! Volte agora e ganhe 10% de desconto no próximo pedido 🎁' },
    },
    {
      name: 'Recuperação 30 dias',
      description: 'Mensagem automática para clientes inativos por 30 dias',
      trigger_type: 'interval_messages',
      trigger_config: { every_n: 30, target: 'inactive' },
      action_type: 'message',
      action_config: { message: 'Faz tempo que não te vemos! Preparamos uma oferta exclusiva pra te reconquistar. Volta pra gente? 💙' },
    },
  ];
  const results = [];
  for (const auto of automations) {
    const result = await createRecoveryAutomation(personaId, { ...auto, owner_id: 'system' });
    results.push(result);
  }
  return results;
}

module.exports = {
  getInactiveCustomers, getChurnRiskCustomers, getAtRiskCustomers,
  createRecoveryAutomation, seedRecoveryAutomations,
};