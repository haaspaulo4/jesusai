const { pool } = require('../db');
const crypto = require('crypto');
function genId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

const ORG_CATEGORIES = ['products', 'services', 'pricing', 'team', 'policies', 'faq', 'processes', 'brand', 'market', 'custom'];

async function createOrgMemory(data) {
  const id = data.id || genId('org');
  const persona_id = data.persona_id || null;
  const owner_id = data.owner_id || 'system';
  const category = data.category || 'custom';
  const title = data.title || 'Untitled';
  const content = data.content || '';
  const tags = typeof data.tags === 'object' ? JSON.stringify(data.tags) : (data.tags || null);
  const priority = data.priority || 'medium';
  const is_active = data.is_active !== false ? 1 : 0;
  const expires_at = data.expires_at || null;

  await pool.execute(
    `INSERT INTO persona_org_memory (id, persona_id, owner_id, category, title, content, tags, priority, is_active, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title=VALUES(title), content=VALUES(content), category=VALUES(category),
     tags=VALUES(tags), priority=VALUES(priority), is_active=VALUES(is_active), expires_at=VALUES(expires_at)`,
    [id, persona_id, owner_id, category, title, content, tags, priority, is_active, expires_at]
  );
  return getOrgMemory(id);
}

async function updateOrgMemory(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'category', 'title', 'content', 'tags', 'priority', 'is_active', 'expires_at'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'tags') val = typeof val === 'object' ? JSON.stringify(val) : val;
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return getOrgMemory(id);
  values.push(id);
  await pool.execute(`UPDATE persona_org_memory SET ${fields.join(', ')} WHERE id = ?`, values);
  return getOrgMemory(id);
}

async function deleteOrgMemory(id) {
  await pool.execute('DELETE FROM persona_org_memory WHERE id = ?', [id]);
  return { deleted: true };
}

async function getOrgMemory(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_org_memory WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatOrgMemory(rows[0]);
}

async function listOrgMemory(filters = {}) {
  let sql = 'SELECT * FROM persona_org_memory WHERE (expires_at IS NULL OR expires_at > NOW())';
  const values = [];
  if (filters.owner_id) { sql += ' AND owner_id = ?'; values.push(filters.owner_id); }
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.category) { sql += ' AND category = ?'; values.push(filters.category); }
  if (filters.is_active !== undefined) { sql += ' AND is_active = ?'; values.push(filters.is_active ? 1 : 0); }
  if (filters.search) {
    sql += ' AND (title LIKE ? OR content LIKE ? OR JSON_CONTAINS(tags, ?) OR category LIKE ?)';
    const s = `%${filters.search}%`;
    values.push(s, s, JSON.stringify(filters.search), filters.search);
  }
  sql += ' ORDER BY CASE priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 WHEN "low" THEN 4 END, created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatOrgMemory);
}

async function searchOrgMemory(query, ownerId, personaId, limit = 5) {
  if (!query || query.trim().length === 0) return [];
  const terms = query.split(/\s+/).filter(t => t.length > 1).map(t => `%${t}%`);
  if (terms.length === 0) return [];

  let sql = 'SELECT * FROM persona_org_memory WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND owner_id = ?';
  const values = [ownerId];
  if (personaId) { sql += ' AND (persona_id = ? OR persona_id IS NULL)'; values.push(personaId); }

  const conditions = terms.map(() => '(title LIKE ? OR content LIKE ? OR JSON_CONTAINS(tags, ?) OR category LIKE ?)');
  sql += ' AND (' + conditions.join(' OR ') + ')';
  for (const term of terms) {
    const jsonTerm = term.replace(/^%|%$/g, '');
    values.push(term, term, JSON.stringify(jsonTerm), jsonTerm);
  }

  sql += ' ORDER BY CASE priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 WHEN "low" THEN 4 END, created_at DESC';
  sql += ` LIMIT ${Number(limit)}`;

  const [rows] = await pool.execute(sql, values);
  return rows.map(formatOrgMemory);
}

function getOrgMemoryContext(memories) {
  if (!memories || memories.length === 0) return '';
  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }
  const sections = Object.entries(grouped).map(([cat, items]) => {
    const lines = items.map(item => `- ${item.title}: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`);
    return `${cat.toUpperCase()}:\n${lines.join('\n')}`;
  });
  return 'ORGANIZATIONAL CONTEXT:\n' + sections.join('\n\n');
}

function formatOrgMemory(row) {
  let tags = row.tags;
  if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = null; } }
  return {
    id: row.id,
    persona_id: row.persona_id,
    owner_id: row.owner_id,
    category: row.category,
    title: row.title,
    content: row.content,
    tags,
    priority: row.priority,
    is_active: !!row.is_active,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  createOrgMemory, updateOrgMemory, deleteOrgMemory, getOrgMemory,
  listOrgMemory, searchOrgMemory, getOrgMemoryContext,
  ORG_CATEGORIES,
};