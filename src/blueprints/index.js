const { pool } = require('../db');
const personaManager = require('../persona/manager');

async function createBlueprint(data) {
  const id = data.id || 'bp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const name = data.name || id;
  const description = data.description || '';
  const category = data.category || 'general';
  const niche = data.niche || 'general';
  const config = typeof data.config === 'object' ? JSON.stringify(data.config) : (data.config || '{}');
  const preview = typeof data.preview === 'object' ? JSON.stringify(data.preview) : (data.preview || null);
  const is_official = data.is_official ? 1 : 0;
  const is_active = data.is_active !== false ? 1 : 0;
  const tags = typeof data.tags === 'object' ? JSON.stringify(data.tags) : (data.tags || null);
  const icon = data.icon || null;
  const color = data.color || null;

  await pool.execute(
    `INSERT INTO persona_blueprints (id, name, description, category, niche, config, preview, is_official, is_active, tags, icon, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), category=VALUES(category),
     niche=VALUES(niche), config=VALUES(config), preview=VALUES(preview), is_official=VALUES(is_official),
     is_active=VALUES(is_active), tags=VALUES(tags), icon=VALUES(icon), color=VALUES(color)`,
    [id, name, description, category, niche, config, preview, is_official, is_active, tags, icon, color]
  );

  return getBlueprint(id);
}

async function updateBlueprint(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['name', 'description', 'category', 'niche', 'config', 'preview', 'is_official', 'is_active', 'tags', 'icon', 'color'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      if (['config', 'preview', 'tags'].includes(key) && typeof data[key] === 'object') {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(data[key]));
      } else {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
  }
  if (fields.length === 0) return getBlueprint(id);
  values.push(id);
  await pool.execute(`UPDATE persona_blueprints SET ${fields.join(', ')} WHERE id = ?`, values);
  return getBlueprint(id);
}

async function deleteBlueprint(id) {
  await pool.execute('DELETE FROM persona_blueprints WHERE id = ?', [id]);
  return { deleted: true };
}

async function getBlueprint(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_blueprints WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatBlueprint(rows[0]);
}

async function listBlueprints(filters = {}) {
  let sql = 'SELECT * FROM persona_blueprints WHERE 1=1';
  const values = [];
  if (filters.category) { sql += ' AND category = ?'; values.push(filters.category); }
  if (filters.niche) { sql += ' AND niche = ?'; values.push(filters.niche); }
  if (filters.is_official !== undefined) { sql += ' AND is_official = ?'; values.push(filters.is_official ? 1 : 0); }
  if (filters.is_active !== undefined) { sql += ' AND is_active = ?'; values.push(filters.is_active ? 1 : 0); }
  if (filters.search) {
    sql += ' AND (name LIKE ? OR description LIKE ? OR niche LIKE ?)';
    const term = `%${filters.search}%`;
    values.push(term, term, term);
  }
  sql += ' ORDER BY is_official DESC, created_at DESC';
  if (filters.limit) { sql += ` LIMIT ${Number(filters.limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatBlueprint);
}

async function getBlueprintCategories() {
  const [rows] = await pool.execute('SELECT DISTINCT category FROM persona_blueprints WHERE is_active = 1 ORDER BY category');
  return rows.map(r => r.category);
}

async function getBlueprintNiches(category = null) {
  let sql = 'SELECT DISTINCT niche FROM persona_blueprints WHERE is_active = 1';
  const values = [];
  if (category) { sql += ' AND category = ?'; values.push(category); }
  sql += ' ORDER BY niche';
  const [rows] = await pool.execute(sql, values);
  return rows.map(r => r.niche);
}

async function cloneBlueprint(blueprintId, overrides = {}) {
  const blueprint = await getBlueprint(blueprintId);
  if (!blueprint) throw new Error(`Blueprint "${blueprintId}" not found`);

  const config = blueprint.config;
  const mergedConfig = { ...config, ...overrides };

  if (overrides.name) mergedConfig.name = overrides.name;
  if (overrides.name_en) mergedConfig.name_en = overrides.name_en;
  if (overrides.name_es) mergedConfig.name_es = overrides.name_es;

  const persona = await personaManager.createPersona(mergedConfig);
  console.log(`[Blueprints] Cloned blueprint "${blueprint.name}" → persona "${persona.name}" (${persona.id})`);
  return persona;
}

async function cloneBlueprintToExisting(blueprintId, targetPersonaId) {
  const blueprint = await getBlueprint(blueprintId);
  if (!blueprint) throw new Error(`Blueprint "${blueprintId}" not found`);

  const config = blueprint.config;
  const updateData = {};

  if (config.identity) updateData.identity = config.identity;
  if (config.topicKeywords) updateData.topicKeywords = config.topicKeywords;
  if (config.emotionKeywords) updateData.emotionKeywords = config.emotionKeywords;
  if (config.commands) updateData.commands = config.commands;
  if (config.disclaimer) updateData.disclaimer = config.disclaimer;
  if (config.conversationWith) updateData.conversationWith = config.conversationWith;
  if (config.memoryBlock) updateData.memoryBlock = config.memoryBlock;
  if (config.profileBlock) updateData.profileBlock = config.profileBlock;
  if (config.groupContext) updateData.groupContext = config.groupContext;
  if (config.cjkFallback) updateData.cjkFallback = config.cjkFallback;
  if (config.llmError) updateData.llmError = config.llmError;
  if (config.welcomeTitle) updateData.welcomeTitle = config.welcomeTitle;
  if (config.welcomeBody) updateData.welcomeBody = config.welcomeBody;
  if (config.knowledgeSources) updateData.knowledgeSources = config.knowledgeSources;
  if (config.ttsVoice) updateData.ttsVoice = config.ttsVoice;
  if (config.ttsLang) updateData.ttsLang = config.ttsLang;

  await personaManager.updatePersona(targetPersonaId, updateData);
  console.log(`[Blueprints] Applied blueprint "${blueprint.name}" to persona ${targetPersonaId}`);
  return personaManager.getPersona(targetPersonaId);
}

async function savePersonaAsBlueprint(personaId, blueprintData = {}) {
  const persona = await personaManager.getPersona(personaId);
  if (!persona) throw new Error(`Persona "${personaId}" not found`);

  const config = {
    identity: persona.identity,
    topicKeywords: persona.topicKeywords,
    emotionKeywords: persona.emotionKeywords,
    namePatterns: persona.namePatterns,
    commands: persona.commands,
    disclaimer: persona.disclaimer,
    conversationWith: persona.conversationWith,
    memoryBlock: persona.memoryBlock,
    profileBlock: persona.profileBlock,
    groupContext: persona.groupContext,
    cjkFallback: persona.cjkFallback,
    llmError: persona.llmError,
    welcomeTitle: persona.welcomeTitle,
    welcomeBody: persona.welcomeBody,
    prayerPrompt: persona.prayerPrompt,
    summaryPrompt: persona.summaryPrompt,
    profileSummaryPrompt: persona.profileSummaryPrompt,
    knowledgeSources: persona.knowledgeSources,
    ttsVoice: persona.ttsVoice,
    ttsLang: persona.ttsLang,
  };

  const preview = {
    name: persona.name,
    name_en: persona.nameEn,
    name_es: persona.nameEs,
    identity_preview: typeof persona.identity === 'object'
      ? (persona.identity['pt-BR']?.core || persona.identity['pt-BR'] || '').substring(0, 200) + '...'
      : String(persona.identity).substring(0, 200) + '...',
  };

  return createBlueprint({
    ...blueprintData,
    name: blueprintData.name || persona.name,
    description: blueprintData.description || `Blueprint from persona: ${persona.name}`,
    category: blueprintData.category || 'general',
    niche: blueprintData.niche || 'general',
    config,
    preview,
    tags: blueprintData.tags || [persona.name, 'custom'],
  });
}

async function getBlueprintStats() {
  const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM persona_blueprints');
  const [officialRows] = await pool.execute('SELECT COUNT(*) as total FROM persona_blueprints WHERE is_official = 1');
  const [activeRows] = await pool.execute('SELECT COUNT(*) as total FROM persona_blueprints WHERE is_active = 1');
  const [catRows] = await pool.execute('SELECT category, COUNT(*) as count FROM persona_blueprints GROUP BY category ORDER BY count DESC');
  const [nicheRows] = await pool.execute('SELECT niche, COUNT(*) as count FROM persona_blueprints GROUP BY niche ORDER BY count DESC LIMIT 10');

  return {
    total: totalRows[0].total,
    official: officialRows[0].total,
    active: activeRows[0].total,
    byCategory: catRows,
    topNiches: nicheRows,
  };
}

function formatBlueprint(row) {
  let config = row.config;
  if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = {}; } }

  let preview = row.preview;
  if (typeof preview === 'string') { try { preview = JSON.parse(preview); } catch { preview = null; } }

  let tags = row.tags;
  if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    niche: row.niche,
    config,
    preview,
    is_official: !!row.is_official,
    is_active: !!row.is_active,
    tags: tags || [],
    icon: row.icon,
    color: row.color,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  createBlueprint,
  updateBlueprint,
  deleteBlueprint,
  getBlueprint,
  listBlueprints,
  getBlueprintCategories,
  getBlueprintNiches,
  cloneBlueprint,
  cloneBlueprintToExisting,
  savePersonaAsBlueprint,
  getBlueprintStats,
};