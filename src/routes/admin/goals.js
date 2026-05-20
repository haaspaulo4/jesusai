const express = require('express');
const router = express.Router();
const { paginated, premiumMiddleware, resolveOwnerId, checkOwner } = require('./middleware');
const goalsModule = require('../../goals');

router.get('/goals', premiumMiddleware, async (req, res) => {
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

router.post('/goals', premiumMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.createGoal({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/progress', premiumMiddleware, async (req, res) => {
  try {
    const progress = await goalsModule.getGoalProgress(req.userId);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/hierarchy', premiumMiddleware, async (req, res) => {
  try {
    const hierarchy = await goalsModule.getGoalHierarchy(req.userId, req.query.persona_id);
    res.json({ hierarchy, total: hierarchy.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/goals/:id', premiumMiddleware, async (req, res) => {
  try {
    const goal = await goalsModule.getGoal(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/goals/:id', premiumMiddleware, async (req, res) => {
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

router.delete('/goals/:id', premiumMiddleware, async (req, res) => {
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

module.exports = router;
