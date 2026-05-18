const { pool } = require('../db');
const crypto = require('crypto');
function genId(prefix) { return prefix + '_' + crypto.randomBytes(8).toString('hex'); }

function evaluateStageTriggers(triggers, context = {}) {
  if (!triggers || typeof triggers !== 'object') return true;
  const { min_messages, keywords, emotion, intent, time_after_minutes } = triggers;
  if (min_messages && context.messageCount && context.messageCount < min_messages) return false;
  if (keywords && Array.isArray(keywords) && context.lastMessage) {
    if (!keywords.some(kw => context.lastMessage.toLowerCase().includes(kw.toLowerCase()))) return false;
  }
  if (emotion && context.emotion && context.emotion !== emotion) return false;
  if (intent && context.intent && context.intent !== intent) return false;
  if (time_after_minutes && context.sessionStart) {
    const elapsed = (Date.now() - new Date(context.sessionStart).getTime()) / 60000;
    if (elapsed < time_after_minutes) return false;
  }
  return true;
}

const DEFAULT_STAGES = [
  { id: 'greeting', name: 'Greeting', description: 'Initial contact and introduction', order: 0 },
  { id: 'discovery', name: 'Discovery', description: 'Understanding needs and context', order: 1 },
  { id: 'engagement', name: 'Engagement', description: 'Active conversation and value delivery', order: 2 },
  { id: 'conversion', name: 'Conversion', description: 'Moving towards action or commitment', order: 3 },
  { id: 'retention', name: 'Retention', description: 'Ongoing relationship and follow-up', order: 4 },
];

async function createConversationStage(data) {
  const id = data.id || genId('stage');
  const persona_id = data.persona_id || null;
  const name = data.name || 'New Stage';
  const description = data.description || '';
  const stage_order = data.stage_order ?? data.order ?? 0;
  const triggers = typeof data.triggers === 'object' ? JSON.stringify(data.triggers) : (data.triggers || null);
  const responses = typeof data.responses === 'object' ? JSON.stringify(data.responses) : (data.responses || null);
  const is_active = data.is_active !== false ? 1 : 0;

  await pool.execute(
    `INSERT INTO persona_conversation_stages (id, persona_id, name, description, stage_order, triggers, responses, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), stage_order=VALUES(stage_order),
     triggers=VALUES(triggers), responses=VALUES(responses), is_active=VALUES(is_active)`,
    [id, persona_id, name, description, stage_order, triggers, responses, is_active]
  );
  return getConversationStage(id);
}

async function updateConversationStage(id, data) {
  const fields = [];
  const values = [];
  const allowed = ['persona_id', 'name', 'description', 'stage_order', 'triggers', 'responses', 'is_active'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'triggers' || key === 'responses') val = typeof val === 'object' ? JSON.stringify(val) : val;
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return getConversationStage(id);
  values.push(id);
  await pool.execute(`UPDATE persona_conversation_stages SET ${fields.join(', ')} WHERE id = ?`, values);
  return getConversationStage(id);
}

async function deleteConversationStage(id) {
  await pool.execute('DELETE FROM persona_conversation_stages WHERE id = ?', [id]);
  return { deleted: true };
}

async function getConversationStage(id) {
  const [rows] = await pool.execute('SELECT * FROM persona_conversation_stages WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  return formatStage(rows[0]);
}

async function listConversationStages(filters = {}) {
  let sql = 'SELECT * FROM persona_conversation_stages WHERE 1=1';
  const values = [];
  if (filters.persona_id) { sql += ' AND persona_id = ?'; values.push(filters.persona_id); }
  if (filters.is_active !== undefined) { sql += ' AND is_active = ?'; values.push(filters.is_active ? 1 : 0); }
  sql += ' ORDER BY stage_order ASC, created_at ASC';
  const [rows] = await pool.execute(sql, values);
  return rows.map(formatStage);
}

async function getUserStage(userId, personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM persona_user_stages WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  if (rows.length === 0) return null;
  return formatUserStage(rows[0]);
}

async function setUserStage(userId, personaId, stageId, sessionId, stageData) {
  const data = stageData ? (typeof stageData === 'object' ? JSON.stringify(stageData) : stageData) : null;
  const [existing] = await pool.execute(
    'SELECT id, stage_history FROM persona_user_stages WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );

  if (existing.length > 0) {
    let history = [];
    try { history = typeof existing[0].stage_history === 'string' ? JSON.parse(existing[0].stage_history) : (existing[0].stage_history || []); } catch { history = []; }
    history.push({ stage: stageId, at: new Date().toISOString() });
    if (history.length > 50) history = history.slice(-50);

    await pool.execute(
      'UPDATE persona_user_stages SET current_stage = ?, stage_data = ?, stage_history = ?, session_id = ? WHERE user_id = ? AND persona_id = ?',
      [stageId, data, JSON.stringify(history), sessionId || null, userId, personaId]
    );
  } else {
    const history = [{ stage: stageId, at: new Date().toISOString() }];
    await pool.execute(
      'INSERT INTO persona_user_stages (user_id, persona_id, session_id, current_stage, stage_data, stage_history) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, personaId, sessionId || null, stageId, data, JSON.stringify(history)]
    );
  }
  return getUserStage(userId, personaId);
}

async function advanceUserStage(userId, personaId, sessionId, context = {}) {
  const currentStage = await getUserStage(userId, personaId);
  const stages = await listConversationStages({ persona_id: personaId });
  
  if (stages.length === 0) return null;
  
  const currentOrder = currentStage
    ? (stages.find(s => s.id === currentStage.current_stage)?.stage_order ?? 0)
    : -1;

  const candidates = stages
    .filter(s => s.stage_order > currentOrder && s.is_active)
    .sort((a, b) => a.stage_order - b.stage_order);

  let nextStage = candidates[0];
  if (nextStage && nextStage.triggers) {
    const triggers = typeof nextStage.triggers === 'string' ? JSON.parse(nextStage.triggers) : nextStage.triggers;
    if (triggers && !evaluateStageTriggers(triggers, context)) {
      nextStage = candidates.find(s => {
        const t = typeof s.triggers === 'string' ? JSON.parse(s.triggers) : s.triggers;
        return !t || evaluateStageTriggers(t, context);
      });
    }
  }

  if (!nextStage) return currentStage;

  const result = await setUserStage(userId, personaId, nextStage.id, sessionId, currentStage?.stage_data);

  try {
    const events = require('../events');
    await events.emit('on_stage_advance', {
      userId, personaId, sessionId,
      previousStage: currentStage?.current_stage || null,
      newStage: nextStage.id,
      stageName: nextStage.name,
      stageOrder: nextStage.stage_order,
    });
  } catch {}

  return result;
}

async function getUserStageContext(userId, personaId) {
  const userStage = await getUserStage(userId, personaId);
  if (!userStage) return '';
  
  const stage = await getConversationStage(userStage.current_stage);
  if (!stage) return '';

  let context = `CONVERSATION STAGE: ${stage.name} (Stage ${stage.stage_order})`;
  if (stage.description) context += `\nStage Description: ${stage.description}`;
  if (userStage.stage_data) {
    const data = typeof userStage.stage_data === 'string' ? userStage.stage_data : JSON.stringify(userStage.stage_data);
    context += `\nStage Data: ${data}`;
  }
  return context;
}

async function ensureDefaultStages(personaId) {
  const existing = await listConversationStages({ persona_id: personaId });
  if (existing.length > 0) return existing;

  for (const stage of DEFAULT_STAGES) {
    await createConversationStage({
      id: personaId ? `${personaId}_${stage.id}` : stage.id,
      persona_id: personaId,
      name: stage.name,
      description: stage.description,
      stage_order: stage.order,
      is_active: true,
    });
  }
  return listConversationStages({ persona_id: personaId });
}

function formatStage(row) {
  let triggers = row.triggers;
  let responses = row.responses;
  if (typeof triggers === 'string') { try { triggers = JSON.parse(triggers); } catch { triggers = null; } }
  if (typeof responses === 'string') { try { responses = JSON.parse(responses); } catch { responses = null; } }
  return {
    id: row.id,
    persona_id: row.persona_id,
    name: row.name,
    description: row.description,
    stage_order: row.stage_order,
    triggers,
    responses,
    is_active: !!row.is_active,
    created_at: row.created_at,
  };
}

function formatUserStage(row) {
  let stage_data = row.stage_data;
  let stage_history = row.stage_history;
  if (typeof stage_data === 'string') { try { stage_data = JSON.parse(stage_data); } catch { stage_data = null; } }
  if (typeof stage_history === 'string') { try { stage_history = JSON.parse(stage_history); } catch { stage_history = []; } }
  return {
    id: row.id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    session_id: row.session_id,
    current_stage: row.current_stage,
    stage_data,
    stage_history,
    updated_at: row.updated_at,
  };
}

module.exports = {
  createConversationStage, updateConversationStage, deleteConversationStage,
  getConversationStage, listConversationStages,
  getUserStage, setUserStage, advanceUserStage, getUserStageContext,
  ensureDefaultStages, DEFAULT_STAGES,
};