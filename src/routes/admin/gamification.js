const express = require('express');
const router = express.Router();
const { premiumMiddleware } = require('./middleware');
const gamificationModule = require('../../gamification');
const progressModule = require('../../progress');

// ===== Gamification (XP) =====
router.get('/xp/:userId', premiumMiddleware, async (req, res) => {
  try {
    const xp = await gamificationModule.getXp(req.params.userId, req.query.persona_id || 'default');
    const nextLevel = gamificationModule.getXpForNextLevel(xp.xp);
    res.json({ ...xp, nextLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/xp/add', premiumMiddleware, async (req, res) => {
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

router.post('/xp/badge', premiumMiddleware, async (req, res) => {
  try {
    const { user_id, persona_id, badge_id, badge_name } = req.body;
    if (!user_id || !badge_id) return res.status(400).json({ error: 'user_id and badge_id required' });
    const result = await gamificationModule.addBadge(user_id, persona_id || 'default', badge_id, badge_name || badge_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/leaderboard', premiumMiddleware, async (req, res) => {
  try {
    const leaderboard = await gamificationModule.getLeaderboard(req.query.persona_id || null, parseInt(req.query.limit) || 20);
    res.json({ leaderboard, total: leaderboard.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/xp/:userId/log', premiumMiddleware, async (req, res) => {
  try {
    const log = await gamificationModule.getXpLog(req.params.userId, req.query.persona_id, parseInt(req.query.limit) || 50);
    res.json({ log, total: log.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Progress State =====
router.get('/progress/:userId', premiumMiddleware, async (req, res) => {
  try {
    const progress = await progressModule.getProgressState(req.params.userId, req.query.persona_id || 'default');
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/progress/:userId', premiumMiddleware, async (req, res) => {
  try {
    const { persona_id, state } = req.body;
    const progress = await progressModule.setProgressState(req.params.userId, persona_id || 'default', state);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/progress/:userId', premiumMiddleware, async (req, res) => {
  try {
    const { persona_id, updates } = req.body;
    const progress = await progressModule.updateProgressState(req.params.userId, persona_id || 'default', updates);
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
