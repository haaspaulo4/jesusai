const { pool } = require('../db');

async function logThought(data) {
  const id = 'thought_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const tools_used = data.tools_used ? (typeof data.tools_used === 'object' ? JSON.stringify(data.tools_used) : data.tools_used) : null;
  const context_injected = data.context_injected ? (typeof data.context_injected === 'object' ? JSON.stringify(data.context_injected) : data.context_injected) : null;
  const reasoning = data.reasoning || null;
  const decision = data.decision || null;

  await pool.execute(
    `INSERT INTO agent_thoughts (id, session_id, user_id, persona_id, message_input, message_output,
     tools_used, context_injected, reasoning, decision, response_time_ms, tokens_used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [id, data.session_id || null, data.user_id || null, data.persona_id || null,
     data.message_input || '', data.message_output || '',
     tools_used, context_injected, reasoning, decision,
     data.response_time_ms || null, data.tokens_used || null]
  );
  return { id, logged: true };
}

async function getThoughts(filters = {}) {
  let sql = 'SELECT * FROM agent_thoughts WHERE 1=1';
  const values = [];
  if (filters.session_id) { sql += ' AND session_id = ?'; values.push(filters.session_id); }
  if (filters.user_id) { sql += ' AND user_id = ?'; values.push(filters.user_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; } else { sql += ' LIMIT 50'; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatThought);
}

async function getThoughtStats(personaId, days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  let sql = `SELECT
    COUNT(*) as total_thoughts,
    AVG(response_time_ms) as avg_response_time,
    AVG(tokens_used) as avg_tokens,
    COUNT(CASE WHEN reasoning IS NOT NULL THEN 1 END) as with_reasoning,
    COUNT(CASE WHEN tools_used IS NOT NULL THEN 1 END) as with_tools
    FROM agent_thoughts WHERE created_at >= ?`;
  const values = [since];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  const [rows] = await pool.execute(sql, values);
  const row = rows[0];

  let toolSql = `SELECT JSON_EXTRACT(tools_used, '$') as tools FROM agent_thoughts WHERE tools_used IS NOT NULL AND created_at >= ?`;
  const toolValues = [since];
  if (personaId) { toolSql += ' AND persona_id = ?'; toolValues.push(personaId); }
  toolSql += ' LIMIT 100';

  return {
    totalThoughts: row.total_thoughts || 0,
    avgResponseTime: Math.round((row.avg_response_time || 0)),
    avgTokens: Math.round((row.avg_tokens || 0)),
    withReasoning: row.with_reasoning || 0,
    withTools: row.with_tools || 0,
    periodDays: days,
  };
}

function formatThought(row) {
  let tools_used = row.tools_used;
  let context_injected = row.context_injected;
  if (typeof tools_used === 'string') { try { tools_used = JSON.parse(tools_used); } catch { tools_used = null; } }
  if (typeof context_injected === 'string') { try { context_injected = JSON.parse(context_injected); } catch { context_injected = null; } }
  return {
    ...row,
    tools_used: tools_used,
    context_injected: context_injected,
  };
}

module.exports = { logThought, getThoughts, getThoughtStats };