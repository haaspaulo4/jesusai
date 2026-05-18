const { pool } = require('../db');
const integrations = require('../llm/integrationManager');
const { getSetting, getAllSettings } = require('../settings');
const personaManager = require('../persona/manager');

async function getStats() {
  const [userCount] = await pool.execute('SELECT COUNT(*) as total FROM users');
  const [msgCount] = await pool.execute('SELECT COUNT(*) as total FROM messages');
  const [sessionCount] = await pool.execute('SELECT COUNT(*) as total FROM sessions');
  const [profileCount] = await pool.execute('SELECT COUNT(*) as total FROM profiles');
  const [feedbackCount] = await pool.execute('SELECT COUNT(*) as total FROM feedback');
  const [postCount] = await pool.execute('SELECT COUNT(*) as total FROM posts');
  const [newsletterCount] = await pool.execute('SELECT COUNT(*) as total FROM newsletter_subscribers');
  const [contactCount] = await pool.execute('SELECT COUNT(*) as total FROM contact_messages');

  const [recentMsgs] = await pool.execute('SELECT COUNT(*) as total FROM messages WHERE timestamp > DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  const [activeSessions] = await pool.execute("SELECT COUNT(*) as total FROM sessions WHERE last_activity > DATE_SUB(NOW(), INTERVAL 1 HOUR)");

  const roles = await pool.execute('SELECT role, COUNT(*) as count FROM users GROUP BY role');
  const roleBreakdown = {};
  for (const row of roles[0]) {
    roleBreakdown[row.role || 'user'] = row.count;
  }

  const integStatus = integrations.getStatusDetailed();

  return {
    users: userCount[0].total,
    messages: msgCount[0].total,
    sessions: sessionCount[0].total,
    profiles: profileCount[0].total,
    feedback: feedbackCount[0].total,
    posts: postCount[0].total,
    newsletter: newsletterCount[0].total,
    contacts: contactCount[0].total,
    messagesLast24h: recentMsgs[0].total,
    activeSessions1h: activeSessions[0].total,
    roleBreakdown,
    integrations: integStatus,
  };
}

async function listUsers(opts = {}) {
  const { page = 1, limit = 20, role, search } = opts;
  const offset = (page - 1) * limit;

  let query = 'SELECT id, email, name, role, persona_id, ollama_api_key IS NOT NULL as has_api_key, telegram_chat_id, created_at FROM users WHERE 1=1';
  const params = [];

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }
  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.execute(query, params);

  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM users');
  const total = totalResult[0].total;

  return { users: rows, total, page, limit };
}

async function getUser(userId) {
  const [rows] = await pool.execute('SELECT id, email, name, role, persona_id, ollama_api_key, telegram_chat_id, created_at FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;

  const [msgCount] = await pool.execute(
    'SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ?',
    [userId]
  );
  const [sessionCount] = await pool.execute('SELECT COUNT(*) as total FROM sessions WHERE user_id = ?', [userId]);
  const [feedbackCount] = await pool.execute('SELECT COUNT(*) as total FROM feedback WHERE user_id = ?', [userId]);

  const user = rows[0];
  user.messageCount = msgCount[0].total;
  user.sessionCount = sessionCount[0].total;
  user.feedbackCount = feedbackCount[0].total;
  user.hasApiKey = !!user.ollama_api_key;
  delete user.ollama_api_key;

  return user;
}

async function setUserRole(userId, role) {
  const validRoles = ['guest', 'user', 'premium', 'admin', 'banned'];
  if (!validRoles.includes(role)) throw new Error(`Invalid role: ${role}. Valid: ${validRoles.join(', ')}`);
  await pool.execute('UPDATE users SET role = ?, token_version = token_version + 1 WHERE id = ?', [role, userId]);
  return { userId, role };
}

async function deleteUser(userId) {
  const tables = ['persona_messages', 'sessions', 'messages', 'user_xp_log', 'user_xp', 'user_progress', 'user_onboarding', 'cognitive_states', 'agent_thoughts', 'follow_ups', 'ratings', 'profiles'];
  for (const table of tables) {
    try {
      const hasCol = await pool.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = 'user_id'`, [table]);
      if (hasCol[0].length > 0) {
        await pool.execute(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
      }
    } catch {}
  }
  try {
    const hasSessionUser = await pool.execute(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sessions' AND COLUMN_NAME IN ('user_id', 'user_name')`);
    if (hasSessionUser[0].length > 0) {
      await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    }
  } catch {}
  await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
}

async function listPersonas() {
  return personaManager.listPersonas();
}

async function getPersona(personaId) {
  return personaManager.getPersona(personaId);
}

async function createPersona(data) {
  return personaManager.createPersona(data);
}

async function updatePersona(personaId, data) {
  data.id = personaId;
  return personaManager.createPersona(data);
}

async function deletePersona(personaId) {
  return personaManager.deletePersona(personaId);
}

async function togglePersona(personaId, isActive) {
  return personaManager.togglePersona(personaId, isActive);
}

async function listIntegrations(serviceType) {
  if (serviceType) {
    return integrations.getStatus(serviceType);
  }
  return integrations.getStatusDetailed();
}

async function addIntegration(serviceType, apiKey, opts) {
  return integrations.addIntegration(serviceType, apiKey, opts);
}

async function removeIntegration(keyId) {
  return integrations.removeIntegration(keyId);
}

async function toggleIntegration(keyId, isActive) {
  return integrations.toggleIntegration(keyId, isActive);
}

async function updateIntegration(keyId, updates) {
  return integrations.updateIntegration(keyId, updates);
}

async function testIntegration(keyId) {
  await integrations._checkHealth();
  const found = integrations._findById(keyId);
  if (!found) throw new Error('Integration not found');
  return {
    id: found.id,
    label: found.label,
    healthy: found.healthy,
    lastError: found.lastError,
    lastHealthCheck: found.lastHealthCheck,
  };
}

async function getSettings() {
  return getAllSettings();
}

async function setSettings(key, value) {
  return setSetting(key, value);
}

async function getKnowledgeStats() {
  try {
    const { getAllSourceStats } = require('../knowledge/store');
    const sources = getAllSourceStats();
    let totalDocuments = 0;
    for (const s of sources) totalDocuments += s.documentCount;
    return {
      sources,
      totalDocuments,
      totalSources: sources.length,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function reindexKnowledge() {
  try {
    const { runIngestion } = require('../knowledge/ingester');
    const { invalidateCache } = require('../knowledge/config');
    invalidateCache();
    await runIngestion();
    return { success: true, message: 'Knowledge reindexed successfully' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function listMCPServers() {
  const mcpClient = require('../mcp/client');
  return mcpClient.getServers();
}

async function addMCPServer(name, command, args, envVars) {
  const mcpClient = require('../mcp/client');
  return mcpClient.addServer(name, command, args, envVars);
}

async function removeMCPServer(serverId) {
  const mcpClient = require('../mcp/client');
  return mcpClient.removeServer(serverId);
}

async function connectMCPServer(serverId) {
  const mcpClient = require('../mcp/client');
  return mcpClient.connectServer(serverId);
}

module.exports = {
  getStats,
  listUsers,
  getUser,
  setUserRole,
  deleteUser,
  listPersonas,
  getPersona,
  createPersona,
  updatePersona,
  deletePersona,
  togglePersona,
  listIntegrations,
  addIntegration,
  removeIntegration,
  toggleIntegration,
  updateIntegration,
  testIntegration,
  getSettings,
  setSettings,
  getKnowledgeStats,
  reindexKnowledge,
  listMCPServers,
  addMCPServer,
  removeMCPServer,
  connectMCPServer,
};