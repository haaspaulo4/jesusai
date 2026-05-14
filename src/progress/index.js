const { pool } = require('../db');

async function getProgressState(userId, personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM user_progress WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  if (rows.length === 0) {
    return { user_id: userId, persona_id: personaId, state: {}, created_at: null, updated_at: null };
  }
  let state = rows[0].state;
  if (typeof state === 'string') { try { state = JSON.parse(state); } catch { state = {}; } }
  return { ...rows[0], state: state || {} };
}

async function setProgressState(userId, personaId, state) {
  const stateJson = typeof state === 'object' ? JSON.stringify(state) : state;
  await pool.execute(
    `INSERT INTO user_progress (user_id, persona_id, state, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE state = VALUES(state), updated_at = NOW()`,
    [userId, personaId, stateJson]
  );
  return getProgressState(userId, personaId);
}

async function updateProgressState(userId, personaId, updates) {
  const current = await getProgressState(userId, personaId);
  const newState = { ...current.state, ...updates };
  return setProgressState(userId, personaId, newState);
}

async function incrementProgressField(userId, personaId, field, amount = 1) {
  const current = await getProgressState(userId, personaId);
  const state = current.state || {};
  state[field] = (state[field] || 0) + amount;
  return setProgressState(userId, personaId, state);
}

async function pushProgressArray(userId, personaId, field, value) {
  const current = await getProgressState(userId, personaId);
  const state = current.state || {};
  if (!Array.isArray(state[field])) state[field] = [];
  if (!state[field].includes(value)) state[field].push(value);
  return setProgressState(userId, personaId, state);
}

async function removeProgressArray(userId, personaId, field, value) {
  const current = await getProgressState(userId, personaId);
  const state = current.state || {};
  if (Array.isArray(state[field])) {
    state[field] = state[field].filter(v => v !== value);
  }
  return setProgressState(userId, personaId, state);
}

function formatProgressContext(progress) {
  if (!progress || !progress.state || Object.keys(progress.state).length === 0) return '';
  const entries = Object.entries(progress.state);
  const lines = entries.map(([key, val]) => {
    if (Array.isArray(val)) return `- ${key}: ${val.join(', ')}`;
    if (typeof val === 'object' && val !== null) return `- ${key}: ${JSON.stringify(val)}`;
    return `- ${key}: ${val}`;
  });
  return 'PROGRESS STATE:\n' + lines.join('\n');
}

module.exports = {
  getProgressState, setProgressState, updateProgressState,
  incrementProgressField, pushProgressArray, removeProgressArray,
  formatProgressContext,
};