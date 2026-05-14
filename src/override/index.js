const { pool } = require('../db');

async function setOverride(sessionId, data) {
  const is_active = data.is_active !== false ? 1 : 0;
  const override_type = data.override_type || 'full';
  const human_message = data.human_message || null;
  const metadata = data.metadata ? (typeof data.metadata === 'object' ? JSON.stringify(data.metadata) : data.metadata) : null;

  await pool.execute(
    `INSERT INTO human_overrides (session_id, user_id, persona_id, is_active, override_type, human_message, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE is_active=VALUES(is_active), override_type=VALUES(override_type),
     human_message=VALUES(human_message), metadata=VALUES(metadata), updated_at=NOW()`,
    [sessionId, data.user_id || null, data.persona_id || null, is_active, override_type, human_message, metadata]
  );
  return getOverride(sessionId);
}

async function getOverride(sessionId) {
  const [rows] = await pool.execute('SELECT * FROM human_overrides WHERE session_id = ?', [sessionId]);
  if (rows.length === 0) return null;
  return formatOverride(rows[0]);
}

async function clearOverride(sessionId) {
  await pool.execute('DELETE FROM human_overrides WHERE session_id = ?', [sessionId]);
  return { cleared: true };
}

async function listOverrides(filters = {}) {
  let sql = 'SELECT * FROM human_overrides WHERE 1=1';
  const values = [];
  if (filters.is_active !== undefined) { sql += ' AND is_active = ?'; values.push(filters.is_active ? 1 : 0); }
  if (filters.user_id) { sql += ' AND user_id = ?'; values.push(filters.user_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  sql += ' ORDER BY updated_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatOverride);
}

async function isOverridden(sessionId) {
  const override = await getOverride(sessionId);
  return override && override.is_active;
}

function formatOverride(row) {
  let metadata = row.metadata;
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { metadata = {}; } }
  return {
    id: row.id,
    session_id: row.session_id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    is_active: !!row.is_active,
    override_type: row.override_type,
    human_message: row.human_message,
    metadata: metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = { setOverride, getOverride, clearOverride, listOverrides, isOverridden };