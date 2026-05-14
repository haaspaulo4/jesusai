const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const quizModule = require('../quiz');
const { authMiddleware } = require('../auth');

const router = express.Router();

// ========== PUBLIC QUIZ ENDPOINTS ==========

router.get('/active', async (req, res) => {
  try {
    const { persona_id } = req.query;
    const quizzes = await quizModule.getActiveQuizzes(persona_id || null);
    const safe = quizzes.map(q => ({
      id: q.id,
      persona_id: q.persona_id,
      title: q.title,
      description: q.description,
      quiz_type: q.quiz_type,
      questionCount: (q.questions || []).length,
      xp_reward: q.xp_reward,
      time_limit_seconds: q.time_limit_seconds,
      settings: {
        showResults: q.settings?.showResults !== false,
        showExplanation: q.settings?.showExplanation !== false,
        shuffleQuestions: q.settings?.shuffleQuestions || false,
        maxAttempts: q.settings?.maxAttempts || null,
      },
      created_at: q.created_at,
    }));
    res.json({ quizzes: safe, total: safe.length });
  } catch (err) {
    console.error('[Quiz] Active quizzes error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const quiz = await quizModule.getQuiz(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json({
      id: quiz.id,
      persona_id: quiz.persona_id,
      title: quiz.title,
      description: quiz.description,
      quiz_type: quiz.quiz_type,
      questions: (quiz.questions || []).map(q => ({
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options,
        timeLimit: q.timeLimit,
        image: q.image,
        media: q.media,
        required: q.required,
        points: q.points,
      })),
      xp_reward: quiz.xp_reward,
      time_limit_seconds: quiz.time_limit_seconds,
      settings: quiz.settings,
    });
  } catch (err) {
    console.error('[Quiz] Get quiz error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const { userId, personaId } = req.body;
    const uid = userId || req.userId || 'user_default';
    const attempt = await quizModule.startAttempt(req.params.id, uid, personaId);
    res.json(attempt);
  } catch (err) {
    console.error('[Quiz] Start attempt error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/attempt/:attemptId/submit', async (req, res) => {
  try {
    const { answers, timeTakenSeconds } = req.body;
    const result = await quizModule.submitAttempt(req.params.attemptId, {
      answers: answers || [],
      timeTakenSeconds,
    });
    res.json(result);
  } catch (err) {
    console.error('[Quiz] Submit attempt error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/attempt/:attemptId', async (req, res) => {
  try {
    const attempt = await quizModule.getAttempt(req.params.attemptId);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    res.json(attempt);
  } catch (err) {
    console.error('[Quiz] Get attempt error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await quizModule.getQuizStats(req.params.id);
    res.json(stats);
  } catch (err) {
    console.error('[Quiz] Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/progress/:userId', authMiddleware, async (req, res) => {
  try {
    const { persona_id } = req.query;
    const progress = await quizModule.getUserQuizProgress(req.params.userId, persona_id);
    res.json({ progress, total: progress.length });
  } catch (err) {
    console.error('[Quiz] Progress error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { personaId, topic, questionCount } = req.body;
    if (!personaId || !topic) return res.status(400).json({ error: 'personaId and topic required' });
    const quiz = await quizModule.generateQuizFromPersona(personaId, topic, questionCount || 5);
    res.json(quiz);
  } catch (err) {
    console.error('[Quiz] Generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;