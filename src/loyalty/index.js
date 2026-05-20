const { pool } = require('../db');
const { getSetting } = require('../settings');
const gamificationModule = require('../gamification');

async function getLoyaltyProgram(personaId) {
  const [rows] = await pool.execute('SELECT * FROM loyalty_programs WHERE persona_id = ? AND is_active = 1', [personaId]);
  if (rows.length > 0) return rows[0];
  const [globalRows] = await pool.execute('SELECT * FROM loyalty_programs WHERE persona_id IS NULL AND is_active = 1');
  return globalRows.length > 0 ? globalRows[0] : null;
}

async function getOrCreateLoyaltyProgram(personaId) {
  const existing = await getLoyaltyProgram(personaId);
  if (existing) return existing;
  const id = `lp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const type = await getSetting('loyalty_type', 'points');
  const pointsPerReal = parseFloat(await getSetting('loyalty_points_per_real', '1')) || 1;
  const cashbackPercent = parseFloat(await getSetting('loyalty_cashback_percent', '5')) || 5;
  const threshold = parseInt(await getSetting('loyalty_minimum_redemption', '100')) || 100;
  await pool.execute(
    'INSERT INTO loyalty_programs (id, persona_id, name, type, points_per_real, cashback_percent, redemption_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, personaId, 'Programa de Fidelidade', type, pointsPerReal, cashbackPercent, threshold]
  );
  return { id, persona_id: personaId, name: 'Programa de Fidelidade', type, points_per_real: pointsPerReal, cashback_percent: cashbackPercent, redemption_threshold: threshold };
}

async function getLoyaltyBalance(userId, personaId) {
  const program = await getLoyaltyProgram(personaId);
  if (!program) return { points: 0, cashback: 0, program: null };
  const [rows] = await pool.execute(
    'SELECT COALESCE(SUM(CASE WHEN type = "earn" THEN points ELSE 0 END), 0) as earned, COALESCE(SUM(CASE WHEN type = "redeem" OR type = "expire" THEN points ELSE 0 END), 0) as spent, COALESCE(SUM(CASE WHEN type = "cashback_earn" THEN cashback_amount ELSE 0 END), 0) as cashback_earned, COALESCE(SUM(CASE WHEN type = "cashback_redeem" THEN cashback_amount ELSE 0 END), 0) as cashback_spent FROM loyalty_transactions WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  const r = rows[0];
  return {
    points: (r.earned || 0) - (r.spent || 0),
    cashback: parseFloat((r.cashback_earned || 0) - (r.cashback_spent || 0)).toFixed(2),
    program,
  };
}

async function earnPoints(userId, personaId, orderId, amount, reason) {
  const program = await getOrCreateLoyaltyProgram(personaId);
  const id = `lt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Idempotency: prevent duplicate points for same order
  if (orderId) {
    const [existing] = await pool.execute(
      'SELECT id FROM loyalty_transactions WHERE order_id = ? AND (type = "earn" OR type = "cashback_earn") LIMIT 1',
      [orderId]
    );
    if (existing.length > 0) {
      return { id: existing[0].id, already_awarded: true, message: 'Pontos já concedidos para este pedido' };
    }
  }

  if (program.type === 'points') {
    const points = Math.round(amount * parseFloat(program.points_per_real));
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, order_id, type, points, description) VALUES (?, ?, ?, ?, "earn", ?, ?)',
      [id, userId, personaId, orderId, points, reason || 'Pontos por pedido']
    );
    return { id, points_earned: points, total_points: 0 };
  }
  if (program.type === 'cashback') {
    const cashback = parseFloat((amount * parseFloat(program.cashback_percent) / 100).toFixed(2));
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, order_id, type, cashback_amount, description) VALUES (?, ?, ?, ?, "cashback_earn", ?, ?)',
      [id, userId, personaId, orderId, cashback, reason || 'Cashback por pedido']
    );
    return { id, cashback_earned: cashback, total_cashback: 0 };
  }
  if (program.type === 'stamp_card') {
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, order_id, type, points, description) VALUES (?, ?, ?, ?, "earn", 1, ?)',
      [id, userId, personaId, orderId, reason || 'Carimbo por pedido']
    );
    return { id, stamps_earned: 1 };
  }
  return { id, earned: false };
}

async function redeemPoints(userId, personaId, pointsOrAmount, rewardId) {
  const balance = await getLoyaltyBalance(userId, personaId);
  const program = balance.program;
  if (!program) return { error: 'Programa de fidelidade não encontrado' };
  const id = `lt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const reward = rewardId ? await getReward(rewardId) : null;
  if (program.type === 'points') {
    const points = reward ? reward.points_cost : parseInt(pointsOrAmount);
    if (balance.points < points) return { error: `Pontos insuficientes. Você tem ${balance.points}, precisa ${points}.` };
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, type, points, description) VALUES (?, ?, ?, "redeem", ?, ?)',
      [id, userId, personaId, points, reward ? `Resgate: ${reward.name}` : 'Resgate de pontos']
    );
    return { id, points_redeemed: points, remaining: balance.points - points };
  }
  if (program.type === 'cashback') {
    const amount = parseFloat(pointsOrAmount);
    if (parseFloat(balance.cashback) < amount) return { error: `Cashback insuficiente. Você tem R$${balance.cashback}, precisa R$${amount}.` };
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, type, cashback_amount, description) VALUES (?, ?, ?, "cashback_redeem", ?, ?)',
      [id, userId, personaId, amount, 'Resgate de cashback']
    );
    return { id, cashback_redeemed: amount, remaining: parseFloat(balance.cashback) - amount };
  }
  if (program.type === 'stamp_card') {
    if (balance.points < program.redemption_threshold) return { error: `Você precisa de ${program.redemption_threshold} carimbos. Tem ${balance.points}.` };
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, type, points, description) VALUES (?, ?, ?, "redeem", ?, ?)',
      [id, userId, personaId, program.redemption_threshold, 'Resgate: cartão completo']
    );
    return { id, stamps_redeemed: program.redemption_threshold, remaining: balance.points - program.redemption_threshold };
  }
  return { error: 'Tipo de programa não suportado' };
}

async function getRewards(personaId) {
  const [rows] = await pool.execute('SELECT * FROM loyalty_rewards WHERE (persona_id = ? OR persona_id IS NULL) AND is_active = 1 ORDER BY points_cost ASC', [personaId]);
  return rows;
}

async function createReward(data) {
  const id = `lr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await pool.execute(
    'INSERT INTO loyalty_rewards (id, persona_id, name, description, points_cost, product_id, discount_percent, discount_fixed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, data.persona_id || null, data.name, data.description || null, data.points_cost, data.product_id || null, data.discount_percent || null, data.discount_fixed || null]
  );
  return { id, ...data };
}

async function getReward(id) {
  const [rows] = await pool.execute('SELECT * FROM loyalty_rewards WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function getLoyaltyHistory(userId, personaId, limit = 20) {
  const [rows] = await pool.execute(
    'SELECT * FROM loyalty_transactions WHERE user_id = ? AND persona_id = ? ORDER BY created_at DESC LIMIT ' + parseInt(limit),
    [userId, personaId]
  );
  return rows;
}

async function expireOldPoints(personaId, daysOld = 90) {
  // Find earn transactions older than N days that haven't been expired yet
  const [rows] = await pool.execute(
    `SELECT id, user_id, persona_id, points FROM loyalty_transactions 
     WHERE type = "earn" AND persona_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
     AND id NOT IN (SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(description, '$.ref')), '') FROM loyalty_transactions WHERE type = "expire" AND persona_id = ?)`,
    [personaId, daysOld, personaId]
  );
  
  let expired = 0;
  for (const row of rows) {
    const id = `lt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await pool.execute(
      'INSERT INTO loyalty_transactions (id, user_id, persona_id, type, points, description) VALUES (?, ?, ?, "expire", ?, ?)',
      [id, row.user_id, row.persona_id, row.points, JSON.stringify({ ref: row.id, reason: 'Pontos expirados' })]
    );
    expired++;
  }
  return { expired };
}

function formatLoyaltyContext(balance) {
  if (!balance || !balance.program) return '';
  const p = balance.program;
  if (p.type === 'points') return `\nFIDELIDADE: Você tem ${balance.points} pontos. A cada R$1 gasto = ${p.points_per_real} ponto${p.points_per_real > 1 ? 's' : ''}. Resgate a partir de ${p.redemption_threshold} pontos.`;
  if (p.type === 'cashback') return `\nFIDELIDADE: Você tem R$${balance.cashback} de cashback. A cada compra, ${p.cashback_percent}% volta como cashback.`;
  if (p.type === 'stamp_card') return `\nFIDELIDADE: Você tem ${balance.points} carimbo${balance.points > 1 ? 's' : ''}. A cada pedido = 1 carimbo. Com ${p.redemption_threshold} carimbos = brinde!`;
  return '';
}

async function listPrograms(personaId) {
  const [rows] = await pool.execute('SELECT * FROM loyalty_programs WHERE persona_id = ? OR persona_id IS NULL ORDER BY created_at DESC', [personaId]);
  return rows;
}

async function updateProgram(id, updates) {
  const allowed = ['name', 'type', 'points_per_real', 'cashback_percent', 'redemption_threshold', 'is_active'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (fields.length === 0) return { error: 'No valid fields' };
  values.push(id);
  await pool.execute(`UPDATE loyalty_programs SET ${fields.join(', ')} WHERE id = ?`, values);
  return { id, updated: true };
}

async function deleteProgram(id) {
  await pool.execute('DELETE FROM loyalty_programs WHERE id = ?', [id]);
  return { id, deleted: true };
}

async function deleteReward(id) {
  await pool.execute('DELETE FROM loyalty_rewards WHERE id = ?', [id]);
  return { id, deleted: true };
}

async function updateReward(id, updates) {
  const allowed = ['name', 'description', 'points_cost', 'product_id', 'discount_percent', 'discount_fixed', 'is_active'];
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (fields.length === 0) return { error: 'No valid fields' };
  values.push(id);
  await pool.execute(`UPDATE loyalty_rewards SET ${fields.join(', ')} WHERE id = ?`, values);
  return { id, updated: true };
}

async function getLoyaltyStats(personaId) {
  const [programs] = await pool.execute('SELECT COUNT(*) as total FROM loyalty_programs WHERE persona_id = ? OR persona_id IS NULL', [personaId]);
  const [transactions] = await pool.execute('SELECT COALESCE(SUM(CASE WHEN type = "earn" THEN points ELSE 0 END), 0) as total_earned, COALESCE(SUM(CASE WHEN type = "redeem" THEN points ELSE 0 END), 0) as total_redeemed, COALESCE(SUM(CASE WHEN type = "cashback_earn" THEN cashback_amount ELSE 0 END), 0) as total_cashback_earned FROM loyalty_transactions WHERE persona_id = ?', [personaId]);
  const [rewards] = await pool.execute('SELECT COUNT(*) as total FROM loyalty_rewards WHERE persona_id = ? OR persona_id IS NULL', [personaId]);
  return { programs: programs[0].total, transactions: transactions[0], rewards: rewards[0].total };
}

module.exports = {
  getLoyaltyProgram, getOrCreateLoyaltyProgram, getLoyaltyBalance,
  earnPoints, redeemPoints, getRewards, createReward, getReward,
  getLoyaltyHistory, expireOldPoints, formatLoyaltyContext,
  listPrograms, updateProgram, deleteProgram, deleteReward,
  updateReward, getLoyaltyStats,
};