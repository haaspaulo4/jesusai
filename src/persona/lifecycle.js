require('dotenv').config();
const { pool } = require('../db');

const PERSONA_STATES = ['draft', 'training', 'testing', 'active', 'paused', 'archived'];
const APPROVAL_MODES = ['manual', 'semi_auto', 'full_auto'];

const DEFAULT_TOOL_PERMISSIONS = {
  draft: { allowed: [], restricted: 'all' },
  training: { allowed: ['bible_lookup', 'user_stats'], restricted: 'most' },
  testing: { allowed: ['bible_lookup', 'user_stats', 'manage_tasks', 'manage_calendar'], restricted: 'some' },
  active: { allowed: 'all', restricted: [] },
  paused: { allowed: [], restricted: 'all' },
  archived: { allowed: [], restricted: 'all' },
};

const PERSONA_TOOLS = [
  'bible_lookup', 'user_stats', 'manage_tasks', 'manage_calendar', 'manage_contacts',
  'manage_automations', 'manage_goals', 'manage_conversation_stages', 'manage_org_memory',
  'manage_xp', 'manage_progress', 'get_cognitive_state', 'human_override', 'get_suggestions',
  'get_dashboard', 'get_history', 'manage_blueprints', 'create_visual', 'list_visual_templates',
  'create_persona', 'list_personas', 'create_skill', 'invoke_skill', 'list_skills',
  'add_knowledge_source',
];

function getAllowedTools(personaState, personaToolOverrides) {
  if (personaState === 'active') {
    if (personaToolOverrides && Array.isArray(personaToolOverrides)) {
      return personaToolOverrides;
    }
    return PERSONA_TOOLS;
  }

  const statePerms = DEFAULT_TOOL_PERMISSIONS[personaState] || DEFAULT_TOOL_PERMISSIONS.draft;
  if (personaToolOverrides && Array.isArray(personaToolOverrides)) {
    return personaToolOverrides.filter(t => statePerms.allowed.includes(t) || statePerms.allowed === 'all');
  }

  if (statePerms.allowed === 'all') return PERSONA_TOOLS;
  return statePerms.allowed || [];
}

async function transitionPersonaState(personaId, newState, updatedBy) {
  const [current] = await pool.execute(
    'SELECT state, lifecycle_state FROM personas WHERE persona_id = ?',
    [personaId]
  );
  if (current.length === 0) return { error: 'Persona not found' };

  const currentState = current[0].lifecycle_state || 'active';
  const allowedTransitions = {
    draft: ['training', 'archived'],
    training: ['testing', 'draft', 'archived'],
    testing: ['active', 'training', 'draft', 'archived'],
    active: ['paused', 'archived'],
    paused: ['active', 'archived'],
    archived: ['draft'],
  };

  const allowed = allowedTransitions[currentState] || [];
  if (!allowed.includes(newState) && !updatedBy?.force) {
    return { error: `Cannot transition from ${currentState} to ${newState}. Allowed: ${allowed.join(', ')}` };
  }

  await pool.execute(
    'UPDATE personas SET lifecycle_state = ?, updated_at = NOW() WHERE persona_id = ?',
    [newState, personaId]
  );

  await pool.execute(
    `INSERT INTO persona_lifecycle_log (persona_id, from_state, to_state, changed_by, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [personaId, currentState, newState, updatedBy?.userId || 'system']
  );

  return { success: true, personaId, from: currentState, to: newState };
}

async function getPersonaLifecycle(personaId) {
  const [logs] = await pool.execute(
    'SELECT * FROM persona_lifecycle_log WHERE persona_id = ? ORDER BY created_at DESC LIMIT 20',
    [personaId]
  );
  return logs;
}

async function setApprovalMode(personaId, mode, updatedBy) {
  if (!APPROVAL_MODES.includes(mode)) {
    return { error: `Invalid mode. Allowed: ${APPROVAL_MODES.join(', ')}` };
  }

  await pool.execute(
    'UPDATE personas SET approval_mode = ?, updated_at = NOW() WHERE persona_id = ?',
    [mode, personaId]
  );

  return { success: true, personaId, approvalMode: mode };
}

async function getApprovalMode(personaId) {
  const [rows] = await pool.execute(
    'SELECT approval_mode FROM personas WHERE persona_id = ?',
    [personaId]
  );
  return rows.length > 0 ? (rows[0].approval_mode || 'full_auto') : 'full_auto';
}

function filterToolDefinitions(allTools, personaState, personaToolOverrides) {
  const allowed = getAllowedTools(personaState, personaToolOverrides);
  if (allowed.length === 0) return [];
  return allTools.filter(t => allowed.includes(t.function?.name));
}

module.exports = {
  PERSONA_STATES,
  APPROVAL_MODES,
  PERSONA_TOOLS,
  DEFAULT_TOOL_PERMISSIONS,
  getAllowedTools,
  transitionPersonaState,
  getPersonaLifecycle,
  setApprovalMode,
  getApprovalMode,
  filterToolDefinitions,
};