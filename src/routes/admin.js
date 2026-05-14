const express = require('express');
const { authMiddleware } = require('../auth');
const admin = require('../admin');
const surveyEngine = require('../survey');
const metaRag = require('../persona/meta-rag');
const personaManager = require('../persona/manager');
const skillsModule = require('../skills');
const agentModule = require('../agent');
const botManager = require('../bot/manager');
const goalsModule = require('../goals');
const stagesModule = require('../stages');
const orgMemoryModule = require('../orgmemory');
const gamificationModule = require('../gamification');
const progressModule = require('../progress');
const cognitiveModule = require('../cognitive');
const overrideModule = require('../override');
const thoughtsModule = require('../thoughts');
const optimizationModule = require('../optimization');
const eventsModule = require('../events');

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
    const { getAllSources } = require('../knowledge/config');
    const { getAllSourceStats } = require('../knowledge/store');
    const sources = getAllSourceStats();
    res.json({
      sources,
      totalSources: sources.length,
      totalDocuments: sources.reduce((sum, s) => sum + s.documentCount, 0),
    });
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

router.post('/knowledge/upload', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const multer = require('multer');
    const path = require('path');
    const { UPLOADS_DIR } = require('../knowledge/config');

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOADS_DIR),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      },
    });
    const upload = multer({
      storage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp', '.mp3', '.wav', '.ogg', '.webm', '.m4a', '.flac', '.txt', '.md', '.json'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext) || file.mimetype === 'application/json') {
          cb(null, true);
        } else {
          cb(new Error(`Unsupported file type: ${ext}`));
        }
      },
    });

    upload.single('file')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { sourceId, sourceName, ingester } = req.body;
      const id = sourceId || path.basename(req.file.originalname, path.extname(req.file.originalname)).replace(/[^a-zA-Z0-9_-]/g, '_');
      const name = sourceName || id;

      const extToType = {
        '.pdf': 'pdf', '.docx': 'docx', '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
        '.webp': 'image', '.tiff': 'image', '.bmp': 'image',
        '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.webm': 'audio', '.m4a': 'audio', '.flac': 'audio',
        '.txt': 'text', '.md': 'text', '.json': 'json',
      };
      const ext = path.extname(req.file.originalname).toLowerCase();
      const fileType = ingester || extToType[ext] || 'text';

      try {
        const { ingestUploadedFile } = require('../knowledge/ingester');
        const documents = await ingestUploadedFile(req.file.path, id, fileType);

        if (!documents || documents.length === 0) {
          return res.status(400).json({ error: 'No text extracted from file' });
        }

        const { saveUploadedSource } = require('../knowledge/config');
        const dataPath = path.join(UPLOADS_DIR, `${id}_documents.json`);
        const indexPath = path.join(UPLOADS_DIR, `${id}_index.json`);

        const fs = require('fs');
        fs.writeFileSync(dataPath, JSON.stringify(documents), 'utf-8');

        const { KnowledgeStore } = require('../knowledge/store');
        const sourceConfig = {
          id,
          name,
          type: fileType,
          enabled: true,
          dataPath,
          indexPath,
          searchFields: ['reference', 'text'],
          defaultTopK: 8,
          contextTemplate: {
            'pt-BR': 'CONTEXTO ENCONTRADO:\n{context}\n\nUse esta informação como base para sua resposta.',
            'en-US': 'CONTEXT FOUND:\n{context}\n\nUse this information as the basis for your response.',
            'es-ES': 'CONTEXTO ENCONTRADO:\n{context}\n\nUsa esta información como base para tu respuesta.',
          },
          sourceFormat: (docs) => docs.map(d => `${d.reference}: "${d.text}"`).join('\n'),
          ingester: fileType,
          filePath: req.file.path,
        };

        saveUploadedSource(sourceConfig);

        const store = new KnowledgeStore(sourceConfig);
        store.buildIndex();

        res.json({
          success: true,
          sourceId: id,
          name,
          type: fileType,
          documents: documents.length,
          message: `Ingested ${documents.length} documents from ${req.file.originalname}`,
        });
      } catch (ingestErr) {
        console.error('[Admin] Upload ingestion error:', ingestErr);
        res.status(500).json({ error: `Ingestion failed: ${ingestErr.message}` });
      }
    });
  } catch (err) {
    console.error('[Admin] Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/knowledge/sources/:sourceId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { removeUploadedSource } = require('../knowledge/config');
    const { invalidateCache } = require('../knowledge/config');
    removeUploadedSource(req.params.sourceId);
    invalidateCache();
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete knowledge source error:', err);
    res.status(500).json({ error: err.message });
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

// ===== Skills =====
router.get('/skills', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    const skills = await skillsModule.listSkills(filters);
    res.json({ skills, total: skills.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skills', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const skill = await skillsModule.createSkill(req.body);
    res.json(skill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/skills/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const skill = await skillsModule.updateSkill(req.params.id, req.body);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    res.json(skill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/skills/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await skillsModule.deleteSkill(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skills/:id/invoke', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await skillsModule.invokeSkill(req.params.id, req.body.input || '', req.body.context || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Tasks =====
router.get('/tasks', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const tasks = await agentModule.listTasks(filters);
    res.json({ tasks, total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', authMiddleware, async (req, res) => {
  try {
    const task = await agentModule.createTask({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const task = await agentModule.updateTask(req.params.id, req.body);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', authMiddleware, async (req, res) => {
  try {
    await agentModule.deleteTask(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Calendar =====
router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const events = await agentModule.listCalendarEvents(filters);
    res.json({ events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar', authMiddleware, async (req, res) => {
  try {
    const event = await agentModule.createCalendarEvent({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/calendar/:id', authMiddleware, async (req, res) => {
  try {
    const event = await agentModule.updateCalendarEvent(req.params.id, req.body);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendar/:id', authMiddleware, async (req, res) => {
  try {
    await agentModule.deleteCalendarEvent(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Contacts (CRM) =====
router.get('/contacts', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const contacts = await agentModule.listContacts(filters);
    res.json({ contacts, total: contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts', authMiddleware, async (req, res) => {
  try {
    const contact = await agentModule.createContact({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    const contact = await agentModule.updateContact(req.params.id, req.body);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/contacts/:id', authMiddleware, async (req, res) => {
  try {
    await agentModule.deleteContact(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Automations =====
router.get('/automations', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const automations = await agentModule.listAutomations(filters);
    res.json({ automations, total: automations.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/automations', authMiddleware, async (req, res) => {
  try {
    const auto = await agentModule.createAutomation({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/automations/:id', authMiddleware, async (req, res) => {
  try {
    const auto = await agentModule.updateAutomation(req.params.id, req.body);
    if (!auto) return res.status(404).json({ error: 'Automation not found' });
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/automations/:id', authMiddleware, async (req, res) => {
  try {
    await agentModule.deleteAutomation(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Dashboard =====
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const stats = await agentModule.getDashboardStats(req.userId || 'system');
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Goals =====
router.get('/goals', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const goals = await goalsModule.listGoals(filters);
    res.json({ goals, total: goals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/goals', authMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.createGoal({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/:id', authMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.getGoal(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/goals/:id', authMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.updateGoal(req.params.id, req.body);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/goals/:id', authMiddleware, async (req, res) => {
  try {
    await goalsModule.deleteGoal(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/progress', authMiddleware, async (req, res) => {
  try {
    const progress = await goalsModule.getGoalProgress(req.userId);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/hierarchy', authMiddleware, async (req, res) => {
  try {
    const hierarchy = await goalsModule.getGoalHierarchy(req.userId, req.query.persona_id);
    res.json({ hierarchy, total: hierarchy.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Conversation Stages =====
router.get('/stages', authMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    const stages = await stagesModule.listConversationStages(filters);
    res.json({ stages, total: stages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages', authMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.createConversationStage(req.body);
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/stages/:id', authMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.updateConversationStage(req.params.id, req.body);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stages/:id', authMiddleware, async (req, res) => {
  try {
    await stagesModule.deleteConversationStage(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/init-defaults', authMiddleware, async (req, res) => {
  try {
    const stages = await stagesModule.ensureDefaultStages(req.body.persona_id || null);
    res.json({ stages, total: stages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stages/user/:userId', authMiddleware, async (req, res) => {
  try {
    const userStage = await stagesModule.getUserStage(req.params.userId, req.query.persona_id || 'default');
    res.json(userStage || { current_stage: null, stage_data: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/user/:userId/advance', authMiddleware, async (req, res) => {
  try {
    const result = await stagesModule.advanceUserStage(req.params.userId, req.body.persona_id || 'default', req.body.session_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Org Memory =====
router.get('/org-memory', authMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId };
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.search) filters.search = req.query.search;
    const memories = await orgMemoryModule.listOrgMemory(filters);
    res.json({ memories, total: memories.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/org-memory', authMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.createOrgMemory({ ...req.body, owner_id: req.userId || req.body.owner_id });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/search', authMiddleware, async (req, res) => {
  try {
    const results = await orgMemoryModule.searchOrgMemory(req.query.q || '', req.userId, req.query.persona_id, 10);
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/:id', authMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!mem) return res.status(404).json({ error: 'Memory not found' });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/org-memory/:id', authMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.updateOrgMemory(req.params.id, req.body);
    if (!mem) return res.status(404).json({ error: 'Memory not found' });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/org-memory/:id', authMiddleware, async (req, res) => {
  try {
    await orgMemoryModule.deleteOrgMemory(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Gamification (XP) =====
router.get('/xp/:userId', authMiddleware, async (req, res) => {
  try {
    const xp = await gamificationModule.getXp(req.params.userId, req.query.persona_id || 'default');
    const nextLevel = gamificationModule.getXpForNextLevel(xp.xp);
    res.json({ ...xp, nextLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/xp/add', authMiddleware, async (req, res) => {
  try {
    const { user_id, persona_id, amount, reason } = req.body;
    if (!user_id || !amount) return res.status(400).json({ error: 'user_id and amount required' });
    const result = await gamificationModule.addXp(user_id, persona_id || 'default', amount, reason || 'admin');
    const badges = await gamificationModule.checkAndAwardBadges(user_id, persona_id || 'default');
    res.json({ ...result, newBadges: badges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/xp/badge', authMiddleware, async (req, res) => {
  try {
    const { user_id, persona_id, badge_id, badge_name } = req.body;
    if (!user_id || !badge_id) return res.status(400).json({ error: 'user_id and badge_id required' });
    const result = await gamificationModule.addBadge(user_id, persona_id || 'default', badge_id, badge_name || badge_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/leaderboard', authMiddleware, async (req, res) => {
  try {
    const leaderboard = await gamificationModule.getLeaderboard(req.query.persona_id || null, parseInt(req.query.limit) || 20);
    res.json({ leaderboard, total: leaderboard.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/:userId/log', authMiddleware, async (req, res) => {
  try {
    const log = await gamificationModule.getXpLog(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 50);
    res.json({ log, total: log.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Progress State =====
router.get('/progress/:userId', authMiddleware, async (req, res) => {
  try {
    const progress = await progressModule.getProgressState(req.params.userId, req.query.persona_id || 'default');
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/progress/:userId', authMiddleware, async (req, res) => {
  try {
    const { persona_id, state } = req.body;
    const progress = await progressModule.setProgressState(req.params.userId, persona_id || 'default', state);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/progress/:userId', authMiddleware, async (req, res) => {
  try {
    const { persona_id, updates } = req.body;
    const progress = await progressModule.updateProgressState(req.params.userId, persona_id || 'default', updates);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Cognitive State =====
router.get('/cognitive/:userId', authMiddleware, async (req, res) => {
  try {
    const state = await cognitiveModule.getLatestCognitiveState(req.params.userId, req.query.persona_id || 'default');
    res.json(state || { emotion: 'neutral', intent: 'general' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/:userId/history', authMiddleware, async (req, res) => {
  try {
    const history = await cognitiveModule.getCognitiveHistory(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 20);
    res.json({ history, total: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await cognitiveModule.getCognitiveStats(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Human Override =====
router.post('/override/activate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { session_id, override_type, human_message, persona_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const override = await overrideModule.setOverride(session_id, {
      is_active: true, override_type: override_type || 'full', human_message, user_id: req.userId, persona_id,
    });
    res.json(override);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/override/deactivate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    await overrideModule.clearOverride(session_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/override/status/:sessionId', authMiddleware, async (req, res) => {
  try {
    const override = await overrideModule.getOverride(req.params.sessionId);
    res.json(override || { active: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/override/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const overrides = await overrideModule.listOverrides({ is_active: true, limit: 20 });
    res.json({ overrides, total: overrides.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Agent Thoughts =====
router.get('/thoughts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const thoughts = await thoughtsModule.getThoughts({ persona_id: req.query.persona_id, limit: parseInt(req.query.limit) || 50 });
    res.json({ thoughts, total: thoughts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/thoughts/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await thoughtsModule.getThoughtStats(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Self-Optimization Suggestions =====
router.get('/suggestions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const suggestions = await optimizationModule.generateSuggestions(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Conversation Simulation =====
router.post('/simulate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { message, persona_id, user_id, language } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const { processMessage } = require('../chat/engine');
    const result = await processMessage({
      message,
      sessionId: 'sim_' + Date.now().toString(36),
      userId: user_id || req.userId,
      language: language || 'pt-BR',
      isGroup: false,
      source: 'simulate',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Blueprints =====
const blueprintsModule = require('../blueprints');
const eventsModule = require('../events');
const reflectionModule = require('../reflection');

router.get('/blueprints', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.category) filters.category = req.query.category;
    if (req.query.niche) filters.niche = req.query.niche;
    if (req.query.search) filters.search = req.query.search;
    if (req.query.is_official !== undefined) filters.is_official = req.query.is_official === 'true';
    if (req.query.is_active !== undefined) filters.is_active = req.query.is_active === 'true';
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    const blueprints = await blueprintsModule.listBlueprints(filters);
    res.json({ blueprints, total: blueprints.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await blueprintsModule.getBlueprintStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/categories', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const categories = await blueprintsModule.getBlueprintCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/niches', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const niches = await blueprintsModule.getBlueprintNiches(req.query.category || null);
    res.json({ niches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(blueprint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/blueprints', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.createBlueprint(req.body);
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/blueprints/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.updateBlueprint(req.params.id, req.body);
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/blueprints/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await blueprintsModule.deleteBlueprint(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/:id/clone', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { overrides } = req.body;
    const persona = await blueprintsModule.cloneBlueprint(req.params.id, overrides || {});
    res.json({ success: true, persona });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/:id/apply/:personaId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const persona = await blueprintsModule.cloneBlueprintToExisting(req.params.id, req.params.personaId);
    res.json({ success: true, persona });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/from-persona/:personaId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.savePersonaAsBlueprint(req.params.personaId, req.body);
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== Events =====
router.get('/events/log', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.event_type) filters.event_type = req.query.event_type;
    if (req.query.user_id) filters.user_id = req.query.user_id;
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    const events = await eventsModule.getEventLog(filters);
    res.json({ events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await eventsModule.getEventStats(parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Self-Reflection =====
router.get('/reflection/:personaId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = await reflectionModule.generateReflection(req.params.personaId, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reflection/:personaId/auto-adjust', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const result = await reflectionModule.autoAdjustPersona(req.params.personaId, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;