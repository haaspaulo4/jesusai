const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware, premiumMiddleware } = require('./middleware');
const cognitiveModule = require('../../cognitive');
const overrideModule = require('../../override');
const thoughtsModule = require('../../thoughts');
const optimizationModule = require('../../optimization');

// ===== Cognitive State =====
router.get('/cognitive/stats', premiumMiddleware, async (req, res) => {
  try {
    const stats = await cognitiveModule.getCognitiveStats(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/:userId', premiumMiddleware, async (req, res) => {
  try {
    const state = await cognitiveModule.getLatestCognitiveState(req.params.userId, req.query.persona_id || 'default');
    res.json(state || { emotion: 'neutral', intent: 'general' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cognitive/:userId/history', premiumMiddleware, async (req, res) => {
  try {
    const history = await cognitiveModule.getCognitiveHistory(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 20);
    res.json({ history, total: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Human Override =====
router.post('/override/activate', adminMiddleware, async (req, res) => {
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

router.post('/override/deactivate', adminMiddleware, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    await overrideModule.clearOverride(session_id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/override/status/:sessionId', premiumMiddleware, async (req, res) => {
  try {
    const override = await overrideModule.getOverride(req.params.sessionId);
    res.json(override || { active: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/override/list', adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const overrides = await overrideModule.listOverrides({ is_active: true });
    res.json({ overrides: overrides.slice(offset, offset + limit), total: overrides.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Agent Thoughts =====
router.get('/thoughts', adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const thoughts = await thoughtsModule.getThoughts({ persona_id: req.query.persona_id, limit: 1000 });
    res.json({ thoughts: thoughts.slice(offset, offset + limit), total: thoughts.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/thoughts/stats', adminMiddleware, async (req, res) => {
  try {
    const stats = await thoughtsModule.getThoughtStats(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Self-Optimization Suggestions =====
router.get('/suggestions', adminMiddleware, async (req, res) => {
  try {
    const suggestions = await optimizationModule.generateSuggestions(req.query.persona_id, parseInt(req.query.days) || 7);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
