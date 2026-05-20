const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('./middleware');
const surveyEngine = require('../../survey');

// ===== Surveys =====
router.get('/surveys', adminMiddleware, async (req, res) => {
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

router.get('/surveys/:id', adminMiddleware, async (req, res) => {
  try {
    const survey = await surveyEngine.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });
    res.json(survey);
  } catch (err) {
    console.error('[Admin] Get survey error:', err);
    res.status(500).json({ error: 'Failed to get survey' });
  }
});

router.post('/surveys', adminMiddleware, async (req, res) => {
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

router.put('/surveys/:id', adminMiddleware, async (req, res) => {
  try {
    const survey = await surveyEngine.updateSurvey(req.params.id, req.body);
    res.json(survey);
  } catch (err) {
    console.error('[Admin] Update survey error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/surveys/:id', adminMiddleware, async (req, res) => {
  try {
    await surveyEngine.deleteSurvey(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete survey error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/surveys/:id/responses', adminMiddleware, async (req, res) => {
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

// ===== Ratings =====
router.get('/ratings', adminMiddleware, async (req, res) => {
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

// ===== Follow-ups =====
router.get('/followups', adminMiddleware, async (req, res) => {
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

router.post('/followups', adminMiddleware, async (req, res) => {
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

router.post('/followups/:id/send', adminMiddleware, async (req, res) => {
  try {
    await surveyEngine.markFollowUpSent(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Mark follow-up sent error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
