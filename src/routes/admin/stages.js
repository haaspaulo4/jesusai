const express = require('express');
const router = express.Router();
const { paginated, premiumMiddleware } = require('./middleware');
const stagesModule = require('../../stages');

router.get('/stages', premiumMiddleware, async (req, res) => {
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

router.post('/stages', premiumMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.createConversationStage(req.body);
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/stages/:id', premiumMiddleware, async (req, res) => {
  try {
    const stage = await stagesModule.updateConversationStage(req.params.id, req.body);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    res.json(stage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/stages/:id', premiumMiddleware, async (req, res) => {
  try {
    await stagesModule.deleteConversationStage(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/init-defaults', premiumMiddleware, async (req, res) => {
  try {
    const stages = await stagesModule.ensureDefaultStages(req.body.persona_id || null);
    res.json({ stages, total: stages.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stages/user/:userId', premiumMiddleware, async (req, res) => {
  try {
    const userStage = await stagesModule.getUserStage(req.params.userId, req.query.persona_id || 'default');
    res.json(userStage || { current_stage: null, stage_data: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/stages/user/:userId/advance', premiumMiddleware, async (req, res) => {
  try {
    const result = await stagesModule.advanceUserStage(req.params.userId, req.body.persona_id || 'default', req.body.session_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
