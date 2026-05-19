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
const { billingManager, PLANS } = require('../billing');
const { workspaceManager, ruleEngine } = require('../workspace');

const router = express.Router();

function paginated(req, maxLimit = 500) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), maxLimit);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

function adminMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function premiumMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!['admin', 'premium', 'user'].includes(req.userRole)) return res.status(403).json({ error: 'Access denied' });
  next();
}

function safeError(err, userRole) {
  if (userRole === 'admin') return err.message;
  const safeMessages = ['not found', 'already exists', 'required', 'invalid', 'expired', 'unauthorized'];
  const msg = (err.message || '').toLowerCase();
  if (safeMessages.some(s => msg.includes(s))) return err.message;
  return 'Internal error';
}

function checkOwner(ownerId, userId, userRole) {
  if (userRole === 'admin') return true;
  return ownerId === userId;
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
    const { limit, offset } = paginated(req, 200);
    const personas = await admin.listPersonas();
    res.json({ personas: personas.slice(offset, offset + limit), total: personas.length, limit, offset });
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
    const { limit, offset } = paginated(req, 200);
    const result = await admin.listIntegrations(service);
    const items = Array.isArray(result) ? result : (result.integrations || result.data || []);
    res.json({ integrations: items.slice(offset, offset + limit), total: items.length, limit, offset });
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
    const ALLOWED_SETTINGS = [
      'brand_name', 'brand_tagline', 'brand_logo_url', 'brand_primary_color', 'brand_secondary_color',
      'onboarding_enabled', 'onboarding_greeting', 'onboarding_greeting_en', 'onboarding_greeting_es',
      'survey_enabled', 'followup_enabled', 'followup_interval_messages', 'ratings_enabled',
      'rate_limit_guest', 'rate_limit_user', 'rate_limit_premium', 'rate_limit_admin',
      'message_chunk_size', 'audio_chunk_size', 'default_persona', 'default_language',
      'welcome_message', 'welcome_message_en', 'welcome_message_es',
    ];
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    if (!ALLOWED_SETTINGS.includes(key)) return res.status(400).json({ error: `Setting "${key}" is not allowed. Allowed: ${ALLOWED_SETTINGS.join(', ')}` });
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
    const sources = await getAllSourceStats();
    const { vectorStore } = require('../embeddings/vectorStore');
    const vectorStats = await vectorStore.getStats();
    res.json({
      sources,
      totalSources: sources.length,
      totalDocuments: sources.reduce((sum, s) => sum + s.documentCount, 0),
      vectorSearch: vectorStats,
    });
  } catch (err) {
    console.error('[Admin] Knowledge stats error:', err);
    res.status(500).json({ error: 'Failed to get knowledge stats' });
  }
});

router.post('/knowledge/reindex', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await admin.reindexKnowledge();

    const { vectorStore } = require('../embeddings/vectorStore');
    let vectorResult = null;
    try {
      vectorResult = await vectorStore.indexAllSources();
    } catch (vecErr) {
      console.warn('[Admin] Vector reindex warning:', vecErr.message);
    }

    res.json({ ...result, vectorReindex: vectorResult });
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
    const { limit, offset } = paginated(req, 200);
    const servers = await admin.listMCPServers();
    const items = Array.isArray(servers) ? servers : [];
    res.json({ servers: items.slice(offset, offset + limit), total: items.length, limit, offset });
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
    const { limit, offset } = paginated(req, 200);
    const bots = await botManager.listBots(platform);
    const active = botManager.getActiveBots();
    const enriched = bots.map(b => ({
      ...b,
      running: active.some(a => a.id === b.id),
    }));
    res.json({ bots: enriched.slice(offset, offset + limit), total: enriched.length, limit, offset });
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
    const { limit, offset } = paginated(req, 200);
    const skills = await skillsModule.listSkills(filters);
    res.json({ skills: skills.slice(offset, offset + limit), total: skills.length, limit, offset });
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
router.get('/tasks', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset, ...filters } = req.query;
    filters.owner_id = req.userId;
    const queryLimit = Math.min(parseInt(limit) || 100, 500);
    const queryOffset = parseInt(offset) || 0;
    filters.limit = queryLimit + queryOffset;
    const tasks = await agentModule.listTasks(filters);
    res.json({ tasks: tasks.slice(queryOffset), total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tasks', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const task = await agentModule.createTask({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tasks/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this task' });
    const task = await agentModule.updateTask(req.params.id, req.body);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/tasks/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this task' });
    await agentModule.deleteTask(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Calendar =====
router.get('/calendar', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId, ...req.query };
    const { limit, offset } = paginated(req, 500);
    const events = await agentModule.listCalendarEvents(filters);
    res.json({ events: events.slice(offset, offset + limit), total: events.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/calendar', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const event = await agentModule.createCalendarEvent({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/calendar/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getCalendarEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this event' });
    const event = await agentModule.updateCalendarEvent(req.params.id, req.body);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/calendar/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getCalendarEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this event' });
    await agentModule.deleteCalendarEvent(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Contacts (CRM) =====
router.get('/contacts', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req);
    const { limit: _l, offset: _o, ...filters } = req.query;
    filters.owner_id = req.userId;
    filters.limit = limit + offset;
    const contacts = await agentModule.listContacts(filters);
    res.json({ contacts: contacts.slice(offset), total: contacts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/contacts', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const contact = await agentModule.createContact({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/contacts/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getContact(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this contact' });
    const contact = await agentModule.updateContact(req.params.id, req.body);
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/contacts/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getContact(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contact not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this contact' });
    await agentModule.deleteContact(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Automations =====
router.get('/automations', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req);
    const { limit: _l, offset: _o, ...filters } = req.query;
    filters.owner_id = req.userId;
    filters.limit = limit + offset;
    const automations = await agentModule.listAutomations(filters);
    res.json({ automations, total: automations.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/automations', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const auto = await agentModule.createAutomation({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/automations/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getAutomation(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this automation' });
    const auto = await agentModule.updateAutomation(req.params.id, req.body);
    res.json(auto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/automations/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await agentModule.getAutomation(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this automation' });
    await agentModule.deleteAutomation(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Dashboard =====
router.get('/dashboard', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const stats = await agentModule.getDashboardStats(req.userId || 'system');
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Goals =====
router.get('/goals', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req);
    const { limit: _l, offset: _o, ...filters } = req.query;
    filters.owner_id = req.userId;
    filters.limit = limit + offset;
    const goals = await goalsModule.listGoals(filters);
    res.json({ goals: goals.slice(offset), total: goals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/goals', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.createGoal({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.getGoal(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/goals/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await goalsModule.getGoal(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this goal' });
    const goal = await goalsModule.updateGoal(req.params.id, req.body);
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/goals/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await goalsModule.getGoal(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Goal not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this goal' });
    await goalsModule.deleteGoal(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/progress', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const progress = await goalsModule.getGoalProgress(req.userId);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/hierarchy', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const hierarchy = await goalsModule.getGoalHierarchy(req.userId, req.query.persona_id);
    res.json({ hierarchy, total: hierarchy.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Conversation Stages =====
router.get('/stages', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    const { limit, offset } = paginated(req, 200);
    const stages = await stagesModule.listConversationStages(filters);
    res.json({ stages: stages.slice(offset, offset + limit), total: stages.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.createConversationStage(req.body);
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/stages/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.updateConversationStage(req.params.id, req.body);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stages/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    await stagesModule.deleteConversationStage(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/init-defaults', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const stages = await stagesModule.ensureDefaultStages(req.body.persona_id || null);
    res.json({ stages, total: stages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stages/user/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const userStage = await stagesModule.getUserStage(req.params.userId, req.query.persona_id || 'default');
    res.json(userStage || { current_stage: null, stage_data: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/user/:userId/advance', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const result = await stagesModule.advanceUserStage(req.params.userId, req.body.persona_id || 'default', req.body.session_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Org Memory =====
router.get('/org-memory', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId };
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.search) filters.search = req.query.search;
    const { limit, offset } = paginated(req, 200);
    const memories = await orgMemoryModule.listOrgMemory(filters);
    res.json({ memories: memories.slice(offset, offset + limit), total: memories.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/org-memory', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.createOrgMemory({ ...req.body, owner_id: req.userRole === "admin" ? (req.body.owner_id || req.userId) : req.userId });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/search', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const results = await orgMemoryModule.searchOrgMemory(req.query.q || '', req.userId, req.query.persona_id, 10);
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!mem) return res.status(404).json({ error: 'Memory not found' });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/org-memory/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this memory' });
    const mem = await orgMemoryModule.updateOrgMemory(req.params.id, req.body);
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/org-memory/:id', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const existing = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this memory' });
    await orgMemoryModule.deleteOrgMemory(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Gamification (XP) =====
router.get('/xp/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const xp = await gamificationModule.getXp(req.params.userId, req.query.persona_id || 'default');
    const nextLevel = gamificationModule.getXpForNextLevel(xp.xp);
    res.json({ ...xp, nextLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/xp/add', authMiddleware, premiumMiddleware, async (req, res) => {
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

router.post('/xp/badge', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { user_id, persona_id, badge_id, badge_name } = req.body;
    if (!user_id || !badge_id) return res.status(400).json({ error: 'user_id and badge_id required' });
    const result = await gamificationModule.addBadge(user_id, persona_id || 'default', badge_id, badge_name || badge_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/leaderboard', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const leaderboard = await gamificationModule.getLeaderboard(req.query.persona_id || null, parseInt(req.query.limit) || 20);
    res.json({ leaderboard, total: leaderboard.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/:userId/log', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const log = await gamificationModule.getXpLog(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 50);
    res.json({ log, total: log.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Progress State =====
router.get('/progress/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const progress = await progressModule.getProgressState(req.params.userId, req.query.persona_id || 'default');
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/progress/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { persona_id, state } = req.body;
    const progress = await progressModule.setProgressState(req.params.userId, persona_id || 'default', state);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/progress/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const { persona_id, updates } = req.body;
    const progress = await progressModule.updateProgressState(req.params.userId, persona_id || 'default', updates);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Cognitive State =====
router.get('/cognitive/:userId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const state = await cognitiveModule.getLatestCognitiveState(req.params.userId, req.query.persona_id || 'default');
    res.json(state || { emotion: 'neutral', intent: 'general' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/:userId/history', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const history = await cognitiveModule.getCognitiveHistory(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 20);
    res.json({ history, total: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/stats', authMiddleware, premiumMiddleware, async (req, res) => {
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

router.get('/override/status/:sessionId', authMiddleware, premiumMiddleware, async (req, res) => {
  try {
    const override = await overrideModule.getOverride(req.params.sessionId);
    res.json(override || { active: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/override/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const overrides = await overrideModule.listOverrides({ is_active: true });
    res.json({ overrides: overrides.slice(offset, offset + limit), total: overrides.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Agent Thoughts =====
router.get('/thoughts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const thoughts = await thoughtsModule.getThoughts({ persona_id: req.query.persona_id, limit: 1000 });
    res.json({ thoughts: thoughts.slice(offset, offset + limit), total: thoughts.length, limit, offset });
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
    const { limit, offset } = paginated(req, 1000);
    const filters = {};
    if (req.query.event_type) filters.event_type = req.query.event_type;
    if (req.query.user_id) filters.user_id = req.query.user_id;
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    filters.limit = limit + offset;
    const events = await eventsModule.getEventLog(filters);
    res.json({ events: events.slice(offset), total: events.length });
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

// ===== Chat Commands =====
const chatCommands = require('../chat/commands');

router.get('/commands', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const commands = await chatCommands.getCommands();
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/commands', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await chatCommands.createCommand({ ...req.body, created_by: req.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/commands/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await chatCommands.updateCommand(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/commands/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await chatCommands.deleteCommand(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/vector-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { vectorStore } = require('../embeddings/vectorStore');
    const stats = await vectorStore.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Vector stats error:', err);
    res.status(500).json({ error: 'Failed to get vector stats' });
  }
});

router.post('/vector-reindex', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { vectorStore } = require('../embeddings/vectorStore');
    const { sourceId } = req.body;
    
    let result;
    if (sourceId) {
      result = await vectorStore.indexSource(sourceId);
    } else {
      result = await vectorStore.indexAllSources();
    }
    
    res.json({ success: true, result });
  } catch (err) {
    console.error('[Admin] Vector reindex error:', err);
    res.status(500).json({ error: 'Failed to reindex vectors' });
  }
});

router.get('/creatives', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    const { persona_id, owner_id, type } = req.query;
    const { limit, offset } = paginated(req, 200);
    const creatives = await creative.listCreatives(persona_id || null, owner_id || 'system', type || null, 1000);
    res.json({ creatives: creatives.slice(offset, offset + limit), total: creatives.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List creatives error:', err);
    res.status(500).json({ error: 'Failed to list creatives' });
  }
});

router.get('/creatives/templates', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    res.json({
      templates: creative.getAvailableTemplates(),
      sizes: creative.getAvailableSizes(),
    });
  } catch (err) {
    console.error('[Admin] List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

router.post('/creatives/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    const { template_id, ...data } = req.body;
    
    if (!template_id) {
      return res.status(400).json({ error: 'template_id is required' });
    }

    const html = creative.compileTemplate(template_id, data);
    const personaId = data.persona_id || 'default';
    const ownerId = req.userId || 'admin';

    const saved = await creative.saveCreative(personaId, ownerId, template_id, template_id, data, html);
    res.json({ success: true, id: saved.id, html });
  } catch (err) {
    console.error('[Admin] Generate creative error:', err);
    res.status(500).json({ error: 'Failed to generate creative' });
  }
});

router.get('/creatives/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    const result = await creative.getCreative(req.params.id);
    if (!result) return res.status(404).json({ error: 'Creative not found' });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Get creative error:', err);
    res.status(500).json({ error: 'Failed to get creative' });
  }
});

router.get('/creatives/:id/html', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    const result = await creative.getCreative(req.params.id);
    if (!result) return res.status(404).json({ error: 'Creative not found' });
    
    const fs = require('fs');
    if (result.html_path && fs.existsSync(result.html_path)) {
      res.setHeader('Content-Type', 'text/html');
      res.send(fs.readFileSync(result.html_path, 'utf-8'));
    } else {
      res.status(404).json({ error: 'HTML file not found' });
    }
  } catch (err) {
    console.error('[Admin] Get creative HTML error:', err);
    res.status(500).json({ error: 'Failed to get creative HTML' });
  }
});

router.delete('/creatives/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const creative = require('../creative');
    await creative.deleteCreative(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] Delete creative error:', err);
    res.status(500).json({ error: 'Failed to delete creative' });
  }
});

router.get('/queue-stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const jobQueue = require('../queue');
    if (!jobQueue.isAvailable()) {
      return res.json({ available: false, message: 'Redis not connected' });
    }
    const stats = await jobQueue.getQueueStats();
    res.json({ available: true, stats });
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

router.get('/search', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { q, collection, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const { fulltextSearch } = require('../search');
    const searchLimit = parseInt(limit) || 10;

    if (collection) {
      const results = fulltextSearch.search(collection, q, searchLimit);
      return res.json({ collection, query: q, results });
    }

    const allResults = {};
    const collections = ['personas', 'knowledge_sources', 'contacts', 'goals', 'org_memory', 'tasks', 'skills'];
    for (const coll of collections) {
      allResults[coll] = fulltextSearch.search(coll, q, searchLimit);
    }

    res.json({ query: q, results: allResults });
  } catch (err) {
    console.error('[Admin] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/search/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { fulltextSearch } = require('../search');
    res.json(fulltextSearch.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/personas/:id/business-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../business');
    const config = await businessModule.getBusinessConfig(req.params.id);
    if (!config) return res.status(404).json({ error: 'Persona not found' });
    res.json({ persona_id: req.params.id, business_config: config });
  } catch (err) {
    console.error('[Admin] Get business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/personas/:id/business-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../business');
    const updated = await businessModule.updateBusinessConfig(req.params.id, req.body);
    res.json({ persona_id: req.params.id, business_config: updated });
  } catch (err) {
    console.error('[Admin] Update business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/personas/:id/business-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../business');
    const defaults = await businessModule.resetBusinessConfig(req.params.id);
    res.json({ persona_id: req.params.id, business_config: defaults, reset: true });
  } catch (err) {
    console.error('[Admin] Reset business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding/steps', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const { persona_id } = req.query;
    const steps = await onboarding.getOnboardingSteps(persona_id || null);
    res.json({ steps });
  } catch (err) {
    console.error('[Admin] Get onboarding steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/steps', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const result = await onboarding.createOnboardingStep(req.body);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Create onboarding step error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/onboarding/steps/:stepKey', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const result = await onboarding.deleteOnboardingStep(req.params.stepKey);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete onboarding step error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/reset', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const { persona_id } = req.body;
    const result = await onboarding.resetOnboardingSteps(persona_id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Reset onboarding steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding/status/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const { persona_id } = req.query;
    const status = await onboarding.getUserOnboardingStatus(req.params.userId, persona_id || null);
    res.json(status);
  } catch (err) {
    console.error('[Admin] Get onboarding status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/reset-user/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../onboarding');
    const { persona_id } = req.body;
    const result = await onboarding.resetUserOnboarding(req.params.userId, persona_id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Reset user onboarding error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Quizzes =====
const quizModule = require('../quiz');

router.get('/quizzes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { persona_id, status, quiz_type, page, limit, search } = req.query;
    const result = await quizModule.listQuizzes({
      persona_id: persona_id || undefined,
      status: status || undefined,
      quiz_type: quiz_type || undefined,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search: search || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] List quizzes error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/quizzes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const quiz = await quizModule.getQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Get quiz error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/quizzes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const quiz = await quizModule.createQuiz({ ...req.body, created_by: req.userId });
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Create quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/quizzes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const quiz = await quizModule.updateQuiz(req.params.id, req.body);
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Update quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/quizzes/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await quizModule.deleteQuiz(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/quizzes/:id/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await quizModule.getQuizStats(req.params.id);
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Quiz stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/quizzes/:id/attempts', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await quizModule.listAttempts({
      quiz_id: req.params.id,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Quiz attempts error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/quizzes/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { personaId, topic, questionCount } = req.body;
    if (!personaId || !topic) return res.status(400).json({ error: 'personaId and topic required' });
    const quiz = await quizModule.generateQuizFromPersona(personaId, topic, questionCount || 5);
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Generate quiz error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Media Library =====
const mediaModule = require('../media');
const multer = require('multer');
const path = require('path');

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = mediaModule.UPLOAD_DIR;
    const fs = require('fs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.get('/media', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { persona_id, type, folder, tag, search, page, limit, sort, order, status } = req.query;
    const result = await mediaModule.listMedia({
      persona_id: persona_id || undefined,
      type: type || undefined,
      folder: folder || undefined,
      tag: tag || undefined,
      search: search || undefined,
      status: status || undefined,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 30,
      sort: sort || 'created_at',
      order: order || 'DESC',
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] List media error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { persona_id } = req.query;
    const stats = await mediaModule.getMediaStats(persona_id || null);
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Media stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/folders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { persona_id } = req.query;
    const folders = await mediaModule.getMediaFolders(persona_id || null);
    res.json({ folders });
  } catch (err) {
    console.error('[Admin] Media folders error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const media = await mediaModule.getMedia(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    res.json(media);
  } catch (err) {
    console.error('[Admin] Get media error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/media/upload', authMiddleware, adminMiddleware, mediaUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { persona_id, title, description, alt_text, caption, tags, folder } = req.body;
    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : (tags || []);

    const media = await mediaModule.createMediaFromUpload(req.file, {
      persona_id: persona_id || null,
      owner_id: req.userId,
      title,
      description,
      alt_text,
      caption,
      tags: parsedTags,
      folder,
    });
    res.json(media);
  } catch (err) {
    console.error('[Admin] Media upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/media/upload-batch', authMiddleware, adminMiddleware, mediaUpload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const { persona_id, folder } = req.body;
    const results = [];
    for (const file of req.files) {
      const media = await mediaModule.createMediaFromUpload(file, {
        persona_id: persona_id || null,
        owner_id: req.userId,
        folder,
      });
      results.push(media);
    }
    res.json({ media: results, total: results.length });
  } catch (err) {
    console.error('[Admin] Batch upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/media/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const media = await mediaModule.updateMedia(req.params.id, req.body);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    res.json(media);
  } catch (err) {
    console.error('[Admin] Update media error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/media/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await mediaModule.deleteMedia(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete media error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Billing
router.get('/billing/plans', authMiddleware, adminMiddleware, (req, res) => {
  res.json(billingManager.getAllPlans());
});

router.get('/billing/usage', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const report = await billingManager.getUsageReport(workspaceId);
    res.json(report);
  } catch (err) {
    console.error('[Admin] Billing usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Workspace
router.get('/workspace/members', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const members = await workspaceManager.getMembers(workspaceId);
    res.json(members);
  } catch (err) {
    console.error('[Admin] Workspace members error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/workspace', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const workspace = await workspaceManager.getWorkspace(workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    console.error('[Admin] Get workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/workspace', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspace = await workspaceManager.createWorkspace(req.body);
    res.json(workspace);
  } catch (err) {
    console.error('[Admin] Create workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/workspace/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspace = await workspaceManager.updateWorkspace(req.params.id, req.body);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    console.error('[Admin] Update workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Business Rules
router.get('/workspace/rules', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const rules = await ruleEngine.listRules(workspaceId);
    res.json(rules);
  } catch (err) {
    console.error('[Admin] List rules error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/workspace/rules', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 'default';
    const rule = await ruleEngine.addRule(workspaceId, req.body);
    res.json(rule);
  } catch (err) {
    console.error('[Admin] Add rule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/workspace/rules/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await ruleEngine.removeRule(req.query.workspace_id || 'default', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] Remove rule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;