const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware, premiumMiddleware } = require('./middleware');
const { pool } = require('../../db');
const admin = require('../../admin');
const agentModule = require('../../agent');
const { billingManager } = require('../../billing');
const { workspaceManager, ruleEngine } = require('../../workspace');

// ===== Stats =====
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const stats = await admin.getStats();
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ===== Dashboard =====
router.get('/dashboard', premiumMiddleware, async (req, res) => {
  try {
    const stats = await agentModule.getDashboardStats(req.userId || 'system');
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Conversation Simulation =====
router.post('/simulate', adminMiddleware, async (req, res) => {
  try {
    const { message, persona_id, user_id, language } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const { processMessage } = require('../../chat/engine');
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

// ===== Search =====
router.get('/search', adminMiddleware, async (req, res) => {
  try {
    const { q, collection, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

    const { fulltextSearch } = require('../../search');
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

router.get('/search/stats', adminMiddleware, async (req, res) => {
  try {
    const { fulltextSearch } = require('../../search');
    res.json(fulltextSearch.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Queue Stats =====
router.get('/queue-stats', adminMiddleware, async (req, res) => {
  try {
    const jobQueue = require('../../queue');
    if (!jobQueue.isAvailable()) {
      return res.json({ available: false, message: 'Redis not connected' });
    }
    const stats = await jobQueue.getQueueStats();
    res.json({ available: true, stats });
  } catch (err) {
    res.json({ available: false, error: err.message });
  }
});

// ===== Self-Reflection =====
router.get('/reflection/:personaId', adminMiddleware, async (req, res) => {
  try {
    const reflectionModule = require('../../reflection');
    const days = parseInt(req.query.days) || 7;
    const result = await reflectionModule.generateReflection(req.params.personaId, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reflection/:personaId/auto-adjust', adminMiddleware, async (req, res) => {
  try {
    const reflectionModule = require('../../reflection');
    const days = parseInt(req.query.days) || 7;
    const result = await reflectionModule.autoAdjustPersona(req.params.personaId, days);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Chat Commands =====
router.get('/commands', adminMiddleware, async (req, res) => {
  try {
    const chatCommands = require('../../chat/commands');
    const commands = await chatCommands.getCommands();
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/commands', adminMiddleware, async (req, res) => {
  try {
    const chatCommands = require('../../chat/commands');
    const result = await chatCommands.createCommand({ ...req.body, created_by: req.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/commands/:id', adminMiddleware, async (req, res) => {
  try {
    const chatCommands = require('../../chat/commands');
    const result = await chatCommands.updateCommand(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/commands/:id', adminMiddleware, async (req, res) => {
  try {
    const chatCommands = require('../../chat/commands');
    const result = await chatCommands.deleteCommand(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Creatives =====
router.get('/creatives', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
    const { persona_id, owner_id, type } = req.query;
    const { limit, offset } = paginated(req, 200);
    const creatives = await creative.listCreatives(persona_id || null, owner_id || 'system', type || null, 1000);
    res.json({ creatives: creatives.slice(offset, offset + limit), total: creatives.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List creatives error:', err);
    res.status(500).json({ error: 'Failed to list creatives' });
  }
});

router.get('/creatives/templates', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
    res.json({
      templates: creative.getAvailableTemplates(),
      sizes: creative.getAvailableSizes(),
    });
  } catch (err) {
    console.error('[Admin] List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

router.post('/creatives/generate', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
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

router.get('/creatives/:id', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
    const result = await creative.getCreative(req.params.id);
    if (!result) return res.status(404).json({ error: 'Creative not found' });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Get creative error:', err);
    res.status(500).json({ error: 'Failed to get creative' });
  }
});

router.get('/creatives/:id/html', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
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

router.delete('/creatives/:id', adminMiddleware, async (req, res) => {
  try {
    const creative = require('../../creative');
    await creative.deleteCreative(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] Delete creative error:', err);
    res.status(500).json({ error: 'Failed to delete creative' });
  }
});

// ===== Quizzes =====
router.get('/quizzes', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
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

router.get('/quizzes/:id', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
    const quiz = await quizModule.getQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Get quiz error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/quizzes', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
    const quiz = await quizModule.createQuiz({ ...req.body, created_by: req.userId });
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Create quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/quizzes/:id', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
    const quiz = await quizModule.updateQuiz(req.params.id, req.body);
    res.json(quiz);
  } catch (err) {
    console.error('[Admin] Update quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/quizzes/:id', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
    const result = await quizModule.deleteQuiz(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete quiz error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/quizzes/:id/stats', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
    const stats = await quizModule.getQuizStats(req.params.id);
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Quiz stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/quizzes/:id/attempts', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
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

router.post('/quizzes/generate', adminMiddleware, async (req, res) => {
  try {
    const quizModule = require('../../quiz');
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
const multer = require('multer');
const path = require('path');
const mediaModule = require('../../media');

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

router.get('/media', adminMiddleware, async (req, res) => {
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

router.get('/media/stats', adminMiddleware, async (req, res) => {
  try {
    const { persona_id } = req.query;
    const stats = await mediaModule.getMediaStats(persona_id || null);
    res.json(stats);
  } catch (err) {
    console.error('[Admin] Media stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/folders', adminMiddleware, async (req, res) => {
  try {
    const { persona_id } = req.query;
    const folders = await mediaModule.getMediaFolders(persona_id || null);
    res.json({ folders });
  } catch (err) {
    console.error('[Admin] Media folders error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/:id', adminMiddleware, async (req, res) => {
  try {
    const media = await mediaModule.getMedia(req.params.id);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    res.json(media);
  } catch (err) {
    console.error('[Admin] Get media error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/media/upload', adminMiddleware, mediaUpload.single('file'), async (req, res) => {
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

router.post('/media/upload-batch', adminMiddleware, mediaUpload.array('files', 20), async (req, res) => {
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

router.put('/media/:id', adminMiddleware, async (req, res) => {
  try {
    const media = await mediaModule.updateMedia(req.params.id, req.body);
    if (!media) return res.status(404).json({ error: 'Media not found' });
    res.json(media);
  } catch (err) {
    console.error('[Admin] Update media error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/media/:id', adminMiddleware, async (req, res) => {
  try {
    const result = await mediaModule.deleteMedia(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete media error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Billing =====
router.get('/billing/plans', adminMiddleware, (req, res) => {
  res.json(billingManager.getAllPlans());
});

router.get('/billing/usage', adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const report = await billingManager.getUsageReport(workspaceId);
    res.json(report);
  } catch (err) {
    console.error('[Admin] Billing usage error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Workspace =====
router.get('/workspace/members', adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const members = await workspaceManager.getMembers(workspaceId);
    res.json(members);
  } catch (err) {
    console.error('[Admin] Workspace members error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/workspace', adminMiddleware, async (req, res) => {
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

router.post('/workspace', adminMiddleware, async (req, res) => {
  try {
    const workspace = await workspaceManager.createWorkspace(req.body);
    res.json(workspace);
  } catch (err) {
    console.error('[Admin] Create workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/workspace/:id', adminMiddleware, async (req, res) => {
  try {
    const workspace = await workspaceManager.updateWorkspace(req.params.id, req.body);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    console.error('[Admin] Update workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== Business Rules =====
router.get('/workspace/rules', adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id || 'default';
    const rules = await ruleEngine.listRules(workspaceId);
    res.json(rules);
  } catch (err) {
    console.error('[Admin] List rules error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/workspace/rules', adminMiddleware, async (req, res) => {
  try {
    const workspaceId = req.body.workspace_id || 'default';
    const rule = await ruleEngine.addRule(workspaceId, req.body);
    res.json(rule);
  } catch (err) {
    console.error('[Admin] Add rule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/workspace/rules/:id', adminMiddleware, async (req, res) => {
  try {
    await ruleEngine.removeRule(req.query.workspace_id || 'default', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] Remove rule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// B2B PROSPECTING
// ==========================================

router.post('/b2b/prospect', adminMiddleware, async (req, res) => {
  try {
    const { niche, location, steps, limit } = req.body;
    if (!niche) return res.status(400).json({ error: 'niche é obrigatório' });
    const b2b = require('../../b2b');
    const result = await b2b.pipeline(niche, location || 'Brasil', { steps: steps || ['discover', 'score'], limit: limit || 20 });
    const saved = await b2b.saveSearch(req.userId, niche, location || 'Brasil', result);
    res.json({ ...saved, leads: result.leads, market_analysis: result.market_analysis });
  } catch (err) {
    console.error('[Admin] B2B prospect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/b2b/enrich', adminMiddleware, async (req, res) => {
  try {
    const { search_id } = req.body;
    const b2b = require('../../b2b');
    const search = await b2b.getSearch(search_id, req.userId);
    if (!search) return res.status(404).json({ error: 'Busca não encontrada' });
    const results = search.results || search;
    const leads = results.leads || [];
    for (let i = 0; i < leads.length; i++) {
      leads[i] = await b2b.enrichLead(leads[i]);
      if (i % 3 === 2) await new Promise(r => setTimeout(r, 500));
    }
    await b2b.saveSearch(req.userId, search.niche, search.location, { ...results, leads });
    res.json({ enriched: leads.length, leads });
  } catch (err) {
    console.error('[Admin] B2B enrich error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/b2b/analyze', adminMiddleware, async (req, res) => {
  try {
    const { search_id } = req.body;
    const b2b = require('../../b2b');
    const search = await b2b.getSearch(search_id, req.userId);
    if (!search) return res.status(404).json({ error: 'Busca não encontrada' });
    const results = search.results || search;
    const leads = results.leads || [];
    const market_analysis = await b2b.analyzeMarket(leads, search.niche, search.location);
    res.json({ market_analysis });
  } catch (err) {
    console.error('[Admin] B2B analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/b2b/diagnose', adminMiddleware, async (req, res) => {
  try {
    const { search_id, lead_index } = req.body;
    const b2b = require('../../b2b');
    const search = await b2b.getSearch(search_id, req.userId);
    if (!search) return res.status(404).json({ error: 'Busca não encontrada' });
    const results = search.results || search;
    const leads = results.leads || [];
    const idx = lead_index || 0;
    if (idx >= leads.length) return res.status(400).json({ error: 'Lead index out of range' });
    const diagnosis = await b2b.diagnoseLead(leads[idx], results.market_analysis);
    res.json({ lead: leads[idx], diagnosis });
  } catch (err) {
    console.error('[Admin] B2B diagnose error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/b2b/searches', adminMiddleware, async (req, res) => {
  try {
    const b2b = require('../../b2b');
    const searches = await b2b.listSearches(req.userId, parseInt(req.query.limit) || 20);
    res.json({ searches });
  } catch (err) {
    console.error('[Admin] B2B list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/b2b/searches/:id', adminMiddleware, async (req, res) => {
  try {
    const b2b = require('../../b2b');
    const search = await b2b.getSearch(req.params.id, req.userId);
    if (!search) return res.status(404).json({ error: 'Busca não encontrada' });
    res.json(search);
  } catch (err) {
    console.error('[Admin] B2B get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/b2b/searches/:id', adminMiddleware, async (req, res) => {
  try {
    const b2b = require('../../b2b');
    await b2b.deleteSearch(req.params.id, req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Admin] B2B delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/b2b/pipeline', adminMiddleware, async (req, res) => {
  try {
    const { niche, location, limit } = req.body;
    if (!niche) return res.status(400).json({ error: 'niche é obrigatório' });
    const b2b = require('../../b2b');
    const result = await b2b.pipeline(niche, location || 'Brasil', {
      steps: ['discover', 'enrich', 'score', 'analyze', 'diagnose'],
      limit: limit || 20
    });
    const saved = await b2b.saveSearch(req.userId, niche, location || 'Brasil', result);
    res.json({ ...saved, leads: result.leads, market_analysis: result.market_analysis });
  } catch (err) {
    console.error('[Admin] B2B pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ========== LOYALTY ==========
router.get('/loyalty/programs', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const programs = await loyalty.listPrograms(req.query.persona_id || 'default');
    res.json(programs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loyalty/programs', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const { getSetting } = require('../../settings');
    const personaId = req.body.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const program = await loyalty.getOrCreateLoyaltyProgram(personaId);
    if (req.body.name || req.body.type || req.body.points_per_real || req.body.cashback_percent || req.body.redemption_threshold) {
      await loyalty.updateProgram(program.id, {
        name: req.body.name, type: req.body.type,
        points_per_real: req.body.points_per_real,
        cashback_percent: req.body.cashback_percent,
        redemption_threshold: req.body.redemption_threshold,
      });
    }
    res.json(await loyalty.getLoyaltyProgram(personaId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/loyalty/programs/:id', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const result = await loyalty.updateProgram(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/loyalty/programs/:id', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    await loyalty.deleteProgram(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loyalty/balance/:userId', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const balance = await loyalty.getLoyaltyBalance(req.params.userId, req.query.persona_id || 'default');
    res.json(balance);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loyalty/history/:userId', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const history = await loyalty.getLoyaltyHistory(req.params.userId, req.query.persona_id || 'default', req.query.limit || 20);
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loyalty/earn', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const result = await loyalty.earnPoints(req.body.user_id, req.body.persona_id || 'default', req.body.order_id, req.body.amount, req.body.reason);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loyalty/redeem', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const result = await loyalty.redeemPoints(req.body.user_id, req.body.persona_id || 'default', req.body.amount, req.body.reward_id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loyalty/rewards', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const rewards = await loyalty.getRewards(req.query.persona_id || 'default');
    res.json(rewards);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loyalty/rewards', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const reward = await loyalty.createReward(req.body);
    res.json(reward);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/loyalty/rewards/:id', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const result = await loyalty.updateReward(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/loyalty/rewards/:id', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    await loyalty.deleteReward(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loyalty/stats', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const stats = await loyalty.getLoyaltyStats(req.query.persona_id || 'default');
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/loyalty/expire', adminMiddleware, async (req, res) => {
  try {
    const loyalty = require('../../loyalty');
    const result = await loyalty.expireOldPoints(req.body.persona_id || 'default', req.body.days || 90);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== BROADCAST ==========
router.get('/broadcasts', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const list = await broadcast.listBroadcasts(req.query.persona_id || 'default', req.query.limit);
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/broadcasts', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const bc = await broadcast.createBroadcast({ ...req.body, persona_id: req.body.persona_id || 'default' });
    res.json(bc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/broadcasts/:id', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const bc = await broadcast.getBroadcast(req.params.id);
    if (!bc) return res.status(404).json({ error: 'Broadcast não encontrado' });
    res.json(bc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/broadcasts/:id', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const result = await broadcast.updateBroadcast(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/broadcasts/:id', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    await broadcast.deleteBroadcast(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/broadcasts/:id/send', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const result = await broadcast.sendBroadcast(req.params.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/broadcasts/:id/logs', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const logs = await broadcast.getBroadcastLogs(req.params.id, req.query.limit);
    res.json(logs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/broadcast-stats', adminMiddleware, async (req, res) => {
  try {
    const broadcast = require('../../broadcast');
    const stats = await broadcast.getBroadcastStats(req.query.persona_id || 'default');
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== REPORTS ==========
router.get('/reports/dashboard', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const dashboard = await reports.getFullDashboard(personaId, req.query.date_from, req.query.date_to);
    res.json(dashboard);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/revenue', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const revenue = await reports.getRevenueReport(personaId, req.query.date_from, req.query.date_to);
    res.json(revenue);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/top-products', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const products = await reports.getTopProducts(personaId, req.query.limit || 10, req.query.date_from, req.query.date_to);
    res.json(products);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/sales-trend', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const trend = await reports.getSalesTrend(personaId, req.query.days || 30);
    res.json(trend);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/conversion', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const funnel = await reports.getConversionFunnel(personaId);
    res.json(funnel);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/customers', adminMiddleware, async (req, res) => {
  try {
    const reports = require('../../erp/reports');
    const { getSetting } = require('../../settings');
    const personaId = req.query.persona_id || await getSetting('persona') || process.env.PERSONA || 'default';
    const customers = await reports.getCustomerMetrics(personaId);
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== DELIVERY DRIVERS ==========
router.get('/delivery/drivers', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const drivers = await delivery.listDrivers(req.query.persona_id || 'default');
    res.json(drivers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/delivery/drivers', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const driver = await delivery.createDriver({ ...req.body, persona_id: req.body.persona_id || 'default' });
    res.json(driver);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/delivery/drivers/:id', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const result = await delivery.updateDriver(req.params.id, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/delivery/drivers/:id', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    await delivery.deleteDriver(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/delivery/assign', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const result = await delivery.assignDriver(req.body.order_id, req.body.driver_id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/delivery/status/:orderId', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const result = await delivery.updateAssignment(req.params.orderId, req.body.status, req.body.notes);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/delivery/track/:orderId', adminMiddleware, async (req, res) => {
  try {
    const delivery = require('../../erp/delivery');
    const assignment = await delivery.getOrderAssignment(req.params.orderId);
    res.json(assignment || { found: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== CUSTOMER RECOVERY ==========
router.get('/recovery/inactive', adminMiddleware, async (req, res) => {
  try {
    const recovery = require('../../erp/recovery');
    const customers = await recovery.getInactiveCustomers(req.query.persona_id || 'default', req.query.days || 7);
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recovery/churn-risk', adminMiddleware, async (req, res) => {
  try {
    const recovery = require('../../erp/recovery');
    const customers = await recovery.getChurnRiskCustomers(req.query.persona_id || 'default');
    res.json(customers);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recovery/at-risk', adminMiddleware, async (req, res) => {
  try {
    const recovery = require('../../erp/recovery');
    const stats = await recovery.getAtRiskCustomers(req.query.persona_id || 'default');
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/recovery/seed-automations', adminMiddleware, async (req, res) => {
  try {
    const recovery = require('../../erp/recovery');
    const result = await recovery.seedRecoveryAutomations(req.body.persona_id || 'default');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== STT STATUS ==========
router.get('/stt/status', adminMiddleware, async (req, res) => {
  try {
    const { getSTTStatus } = require('../../stt');
    const status = await getSTTStatus();
    res.json(status);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== AI USAGE STATS ==========
router.get('/ai-usage', adminMiddleware, async (req, res) => {
  try {
    const { limit } = { limit: 100 };
    const [rows] = await pool.execute(
      `SELECT tenant_id, model, provider, request_type, SUM(prompt_tokens) as total_prompt, SUM(completion_tokens) as total_completion, SUM(cost) as total_cost, COUNT(*) as requests, DATE(created_at) as date
       FROM ai_usage_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY tenant_id, model, provider, request_type, DATE(created_at)
       ORDER BY date DESC LIMIT ?`,
      [limit]
    );
    const [totals] = await pool.execute(
      `SELECT SUM(prompt_tokens) as total_prompt, SUM(completion_tokens) as total_completion, SUM(cost) as total_cost, COUNT(*) as total_requests FROM ai_usage_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    res.json({ daily: rows, totals: totals[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== SCHEDULING ==========
router.get('/scheduling/appointments', adminMiddleware, async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const { persona_id = 'default', status, date_from, date_to } = req.query;
    const appointments = await scheduling.listAppointments(persona_id, { status, date_from, date_to, limit: 50 });
    res.json({ appointments });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/scheduling/slots', adminMiddleware, async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const { persona_id = 'default', service_type_id, date } = req.query;
    const slots = await scheduling.availableSlots(persona_id, service_type_id || null, date || new Date().toISOString().split('T')[0]);
    res.json({ slots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/scheduling/service-types', adminMiddleware, async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const { persona_id = 'default' } = req.query;
    const types = await scheduling.getServiceTypes(persona_id);
    res.json({ service_types: types });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/scheduling/service-types', adminMiddleware, async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const result = await scheduling.createServiceType({ ...req.body, personaId: req.body.persona_id || 'default' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/scheduling/book', async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const { persona_id, service_type_id, start_time, customer_name, customer_phone, customer_email, notes } = req.body;
    const result = await scheduling.bookSlot(persona_id || 'default', service_type_id, start_time, { customerName: customer_name, customerPhone: customer_phone, customerEmail: customer_email, notes }, { ownerId: req.userId });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/scheduling/appointments/:id/cancel', adminMiddleware, async (req, res) => {
  try {
    const scheduling = require('../../services/scheduling');
    const result = await scheduling.cancelAppointment(req.params.id, req.body.reason || '');
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== AUTOMATIONS (Services) ==========
router.put('/automations/:id/toggle', adminMiddleware, async (req, res) => {
  try {
    const automation = require('../../services/automation');
    const result = await automation.toggleAutomation(req.params.id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/automations/stats', adminMiddleware, async (req, res) => {
  try {
    const automation = require('../../services/automation');
    const { persona_id = 'default' } = req.query;
    const stats = await automation.getAutomationStats(persona_id);
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/automations/seed', adminMiddleware, async (req, res) => {
  try {
    const automation = require('../../services/automation');
    const result = await automation.seedDefaultAutomations(req.body.persona_id || 'default', req.userId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== PUBLIC APIs ==========
router.get('/public-apis/:endpoint', adminMiddleware, async (req, res) => {
  try {
    const apiClient = require('../../services/publicApi');
    const { endpoint } = req.params;
    const methods = ['weather', 'cep', 'geocode', 'catFact', 'dogFact', 'joke', 'advice', 'exchangeRates', 'wikiSearch', 'horoscope', 'news', 'dogImage', 'catImage', 'gitHubUser'];
    if (!methods.includes(endpoint)) return res.status(404).json({ error: 'Unknown API endpoint' });
    const result = await apiClient[endpoint](...Object.values(req.query));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== SETUP WIZARD ==========
router.get('/wizard', async (req, res) => {
  try {
    const wizard = require('../../wizard');
    const state = await wizard.getWizardState(req.userId);
    res.json(state || { currentStep: 0, completed: [], data: {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/wizard/:step', async (req, res) => {
  try {
    const wizard = require('../../wizard');
    const result = await wizard.saveWizardStep(req.userId, req.params.step, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/wizard/apply', async (req, res) => {
  try {
    const wizard = require('../../wizard');
    const result = await wizard.applyWizard(req.userId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/wizard/reset', async (req, res) => {
  try {
    const wizard = require('../../wizard');
    const result = await wizard.resetWizard(req.userId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
