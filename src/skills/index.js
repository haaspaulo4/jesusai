const { pool } = require('../db');
const crypto = require('crypto');
function genId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

async function createSkill(data) {
  const id = data.id || 'skill_' + Date.now().toString(36);
  const persona_id = data.persona_id || null;
  const name = data.name || id;
  const description = data.description || '';
  const type = data.type || 'action';
  const prompt = data.prompt || '';
  const parameters = typeof data.parameters === 'object' ? JSON.stringify(data.parameters) : (data.parameters || null);
  const output_format = data.output_format || 'text';
  const is_active = data.is_active !== false ? 1 : 0;

  await pool.execute(
    `INSERT INTO persona_skills (id, persona_id, name, description, type, prompt, parameters, output_format, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), type=VALUES(type),
     prompt=VALUES(prompt), parameters=VALUES(parameters), output_format=VALUES(output_format), is_active=VALUES(is_active)`,
    [id, persona_id, name, description, type, prompt, parameters, output_format, is_active]
  );

  return { id, persona_id, name, description, type, prompt, parameters: data.parameters, output_format, is_active: !!is_active };
}

async function updateSkill(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'name', 'description', 'type', 'prompt', 'parameters', 'output_format', 'is_active'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(key === 'parameters' ? (typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]) : data[key]);
    }
  }
  if (fields.length === 0) return getSkill(id);
  values.push(id);
  await pool.execute(`UPDATE persona_skills SET ${fields.join(', ')} WHERE id = ?`, values);
  return getSkill(id);
}

async function deleteSkill(id) {
  await pool.execute('DELETE FROM persona_skills WHERE id = ?', [id]);
  return { deleted: true };
}

async function getSkill(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_skills WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatSkill(rows[0]);
}

async function listSkills(filters = {}) {
  let sql = 'SELECT * FROM persona_skills WHERE 1=1';
  const values = [];
  if (filters.persona_id) {
    sql += ' AND (persona_id = ? OR persona_id IS NULL)';
    values.push(filters.persona_id);
  }
  if (filters.type) {
    sql += ' AND type = ?';
    values.push(filters.type);
  }
  if (filters.is_active !== undefined) {
    sql += ' AND is_active = ?';
    values.push(filters.is_active ? 1 : 0);
  }
  sql += ' ORDER BY created_at DESC';
  if (filters.limit) {
    sql += ` LIMIT ${Number(filters.limit)}`;
  }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatSkill);
}

function formatSkill(row) {
  let parameters = row.parameters;
  if (typeof parameters === 'string') {
    try { parameters = JSON.parse(parameters); } catch { parameters = null; }
  }
  return {
    id: row.id,
    persona_id: row.persona_id,
    name: row.name,
    description: row.description,
    type: row.type,
    prompt: row.prompt,
    parameters,
    output_format: row.output_format,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sanitizeForPrompt(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<(\/?\w+[^>]*)>/g, '').replace(/\{([^}]*)\}/g, '($1)').replace(/\b(system|assistant|user|tool|function)\b/gi, '');
}

async function invokeSkill(skillId, input, context = {}) {
  const skill = await getSkill(skillId);
  if (!skill) throw new Error(`Skill "${skillId}" not found`);
  if (!skill.is_active) throw new Error(`Skill "${skillId}" is not active`);

  if (skill.type === 'opencode' || skill.type === 'task') {
    const { invokeSkillOpenCode } = require('./opencode');
    return invokeSkillOpenCode(skillId, input, context);
  }

  const integrations = require('../llm/integrationManager');
  const { getSetting } = require('../settings');

  const safeInput = sanitizeForPrompt(input || '');
  const safeContext = sanitizeForPrompt(JSON.stringify(context));
  const systemPrompt = skill.prompt.replace(/\{input\}/g, safeInput).replace(/\{context\}/g, safeContext || '{}');
  const maxTokens = parseInt(await getSetting('max_tokens', '4096')) || 4096;

  const result = await integrations.callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: safeInput || 'Execute this skill.' },
    ],
    { stream: false, temperature: 0.7, numPredict: Math.min(maxTokens, 2000), retries: 1, timeout: 60000 }
  );

  const content = result.content || result.choices?.[0]?.message?.content || '';
  return { skillId: skill.id, skillName: skill.name, type: skill.type, output_format: skill.output_format, result: content };
}

async function getSkillsForPersona(personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM persona_skills WHERE (persona_id = ? OR persona_id IS NULL) AND is_active = 1 ORDER BY created_at DESC',
    [personaId]
  );
  return rows.map(formatSkill);
}

module.exports = { createSkill, updateSkill, deleteSkill, getSkill, listSkills, invokeSkill, getSkillsForPersona, sanitizeForPrompt };