const express = require('express');
const { authMiddleware } = require('../auth');
const admin = require('../admin');
const surveyEngine = require('../survey');
const metaRag = require('../persona/meta-rag');
const personaManager = require('../persona/manager');
const botManager = require('../bot/manager');

const router = express.Router();

function adminMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { pool } = require('../db');
  pool.execute('SELECT role FROM users WHERE id = ?', [req.userId])
    .then(([rows]) => {
      if (rows.length === 0 || rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    })
    .catch(() => res.status(500).json({ error: 'Server error' }));
}

router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await admin.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, role, search } = req.query;
    const result = await admin.listUsers({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, role, search });
    res.json(result);
  } catch (err) {
    console.error('[Admin] List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await admin.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[Admin] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.put('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const result = await admin.setUserRole(req.params.id, role);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Set role error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await admin.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/personas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const personas = await admin.listPersonas();
    res.json(personas);
  } catch (err) {
    console.error('[Admin] List personas error:', err);
    res.status(500).json({ error: 'Failed to list personas' });
  }
});

router.get('/personas/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.getPersona(req.params.id);
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Get persona error:', err);
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

router.post('/personas', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.createPersona(req.body);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Create persona error:', err);
    res.status(500).json({ error: 'Failed to create persona' });
  }
});

router.put('/personas/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.updatePersona(req.params.id, req.body);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Update persona error:', err);
    res.status(500).json({ error: 'Failed to update persona' });
  }
});

router.delete('/personas/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await admin.deletePersona(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete persona error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/personas/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await admin.togglePersona(req.params.id, active !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Toggle persona error:', err);
    res.status(500).json({ error: 'Failed to toggle persona' });
  }
});

router.get('/integrations', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { service } = req.query;
    const result = await admin.listIntegrations(service);
    res.json(result);
  } catch (err) {
    console.error('[Admin] List integrations error:', err);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

router.post('/integrations', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { service_type, api_key, base_url, model, label, priority, extra_config } = req.body;
    if (!service_type) return res.status(400).json({ error: 'service_type is required' });

    const result = await admin.addIntegration(service_type, api_key || '', {
      baseUrl: base_url,
      model,
      label,
      priority: priority || 100,
      extraConfig: extra_config,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Add integration error:', err);
    res.status(500).json({ error: 'Failed to add integration' });
  }
});

router.delete('/integrations/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await admin.removeIntegration(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Remove integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/integrations/:id/toggle', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await admin.toggleIntegration(parseInt(req.params.id), active !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Toggle integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/integrations/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await admin.updateIntegration(parseInt(req.params.id), req.body);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Update integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/integrations/:id/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await admin.testIntegration(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Test integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await admin.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('[Admin] Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.put('/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    const result = await admin.setSettings(key, value);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Set settings error:', err);
    res.status(500).json({ error: 'Failed to set setting' });
  }
});

router.get('/knowledge', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await admin.getKnowledgeStats();
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Knowledge stats error:', err);
    res.status(500).json({ error: 'Failed to get knowledge stats' });
  }
});

router.post('/knowledge/reindex', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await admin.reindexKnowledge();
    res.json(result);
  } catch (err) {
    console.error('[Admin] Reindex error:', err);
    res.status(500).json({ error: 'Failed to reindex' });
  }
});

router.get('/mcp', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const servers = await admin.listMCPServers();
    res.json(servers);
  } catch (err) {
    console.error('[Admin] List MCP error:', err);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

router.post('/mcp', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, command, args, env_vars } = req.body;
    if (!name || !command) return res.status(400).json({ error: 'name and command required' });
    const result = await admin.addMCPServer(name, command, args || [], env_vars || {});
    res.json(result);
  } catch (err) {
    console.error('[Admin] Add MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/mcp/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await admin.removeMCPServer(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Remove MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/mcp/:id/connect', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await admin.connectMCPServer(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Connect MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PERSONA GENERATION (Meta-RAG) ==========

router.post('/personas/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const persona = await metaRag.createPersonaFromDescription(description, req.userId);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Generate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personas/:id/activate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await personaManager.togglePersona(req.params.id, true);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Activate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personas/:id/deactivate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (req.params.id === 'jesus') return res.status(400).json({ error: 'Cannot deactivate default persona' });
    await personaManager.togglePersona(req.params.id, false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Deactivate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== SURVEYS ==========

router.get('/surveys', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, activeOnly } = req.query;
    const result = await surveyEngine.listSurveys({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      activeOnly: activeOnly === 'true',
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] List surveys error:', err);
    res.status(500).json({ error: 'Failed to list surveys' });
  }
});

router.get('/surveys/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const survey = await surveyEngine.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json(survey);
  } catch (err) {
    console.error('[Admin] Get survey error:', err);
    res.status(500).json({ error: 'Failed to get survey' });
  }
});

router.post('/surveys', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { title, description, questions, triggerType, triggerConfig } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!questions || !Array.isArray(questions)) return res.status(400).json({ error: 'questions array is required' });
    const survey = await surveyEngine.createSurvey({ title, description, questions, triggerType, triggerConfig });
    res.json(survey);
  } catch (err) {
    console.error('[Admin] Create survey error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/surveys/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const survey = await surveyEngine.updateSurvey(req.params.id, req.body);
    res.json(survey);
  } catch (err) {
    console.error('[Admin] Update survey error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/surveys/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await surveyEngine.deleteSurvey(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete survey error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/surveys/:id/responses', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await surveyEngine.getSurveyResponses(req.params.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Get survey responses error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== RATINGS ==========

router.get('/ratings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { category, source, userId, page, limit } = req.query;
    const result = await surveyEngine.getRatings({
      category,
      source,
      userId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Get ratings error:', err);
    res.status(500).json({ error: 'Failed to get ratings' });
  }
});

// ========== FOLLOW-UPS ==========

router.get('/followups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, status, type, page, limit } = req.query;
    const result = await surveyEngine.getFollowUps({
      userId,
      status,
      type,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Get follow-ups error:', err);
    res.status(500).json({ error: 'Failed to get follow-ups' });
  }
});

router.post('/followups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, sessionId, type, question, scheduledAt } = req.body;
    if (!userId || !type || !question) return res.status(400).json({ error: 'userId, type, question required' });
    const result = await surveyEngine.createFollowUp({ userId, sessionId, type, question, scheduledAt });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Create follow-up error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/followups/:id/send', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await surveyEngine.markFollowUpSent(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Mark follow-up sent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== BOT INSTANCES (Multi-Bot) ==========

router.get('/bots', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { platform } = req.query;
    const bots = await botManager.listBots(platform);
    const active = botManager.getActiveBots();
    const enriched = bots.map(b => ({
      ...b,
      running: active.some(a => a.id === b.id),
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[Admin] List bots error:', err);
    res.status(500).json({ error: 'Failed to list bots' });
  }
});

router.get('/bots/active', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    res.json(botManager.getActiveBots());
  } catch (err) {
    console.error('[Admin] Active bots error:', err);
    res.status(500).json({ error: 'Failed to get active bots' });
  }
});

router.get('/bots/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const bot = await botManager.getBot(parseInt(req.params.id));
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Get bot error:', err);
    res.status(500).json({ error: 'Failed to get bot' });
  }
});

router.post('/bots', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { platform, name, token, webhookUrl, instanceName, personaId, config } = req.body;
    if (!platform || !name) return res.status(400).json({ error: 'platform and name are required' });
    if (!['telegram', 'whatsapp'].includes(platform)) return res.status(400).json({ error: 'platform must be telegram or whatsapp' });
    const bot = await botManager.addBot({ platform, name, token, webhookUrl, instanceName, personaId, config });
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Add bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/bots/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const bot = await botManager.updateBot(parseInt(req.params.id), req.body);
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Update bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bots/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await botManager.deleteBot(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/:id/start', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await botManager.startBot(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Start bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/:id/stop', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await botManager.stopBot(parseInt(req.params.id));
    res.json({ ok: true, status: 'stopped' });
  } catch (err) {
    console.error('[Admin] Stop bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/start-all', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const results = await botManager.startAllBots();
    res.json(results);
  } catch (err) {
    console.error('[Admin] Start all bots error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;