const { pool } = require('../db');
const gamification = require('../gamification');

const QUIZ_TYPES = ['multiple_choice', 'true_false', 'open_ended', 'ordered', 'fill_blank', 'survey'];
const QUIZ_STATUS = ['draft', 'active', 'closed', 'archived'];

async function createQuiz({ persona_id, title, description, quiz_type, questions, settings, xp_reward, badge_id, time_limit_seconds, metadata, created_by }) {
  const id = 'quiz_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  await pool.execute(
    `INSERT INTO quizzes (id, persona_id, title, description, quiz_type, questions, settings, xp_reward, badge_id, time_limit_seconds, metadata, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      id,
      persona_id || null,
      title,
      description || null,
      quiz_type || 'multiple_choice',
      JSON.stringify(questions || []),
      JSON.stringify(settings || {}),
      xp_reward || 10,
      badge_id || null,
      time_limit_seconds || null,
      JSON.stringify(metadata || {}),
      created_by || null,
    ]
  );
  return getQuiz(id);
}

async function getQuiz(quizId) {
  const [rows] = await pool.execute('SELECT * FROM quizzes WHERE id = ?', [quizId]);
  if (rows.length === 0) return null;
  return deserializeQuiz(rows[0]);
}

async function listQuizzes({ persona_id, status, quiz_type, page, limit, search } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM quizzes WHERE 1=1';
  const params = [];

  if (persona_id) { query += ' AND persona_id = ?'; params.push(persona_id); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  else { query += " AND status != 'archived'"; }
  if (quiz_type) { query += ' AND quiz_type = ?'; params.push(quiz_type); }
  if (search) { query += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.execute(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM quizzes WHERE 1=1';
  const countParams = [];
  if (persona_id) { countQuery += ' AND persona_id = ?'; countParams.push(persona_id); }
  if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
  else { countQuery += " AND status != 'archived'"; }
  const [totalResult] = await pool.execute(countQuery, countParams);

  return {
    quizzes: rows.map(deserializeQuiz),
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function updateQuiz(quizId, updates) {
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.quiz_type !== undefined) { fields.push('quiz_type = ?'); values.push(updates.quiz_type); }
  if (updates.questions !== undefined) { fields.push('questions = ?'); values.push(JSON.stringify(updates.questions)); }
  if (updates.settings !== undefined) { fields.push('settings = ?'); values.push(JSON.stringify(updates.settings)); }
  if (updates.xp_reward !== undefined) { fields.push('xp_reward = ?'); values.push(updates.xp_reward); }
  if (updates.badge_id !== undefined) { fields.push('badge_id = ?'); values.push(updates.badge_id); }
  if (updates.time_limit_seconds !== undefined) { fields.push('time_limit_seconds = ?'); values.push(updates.time_limit_seconds); }
  if (updates.metadata !== undefined) { fields.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.persona_id !== undefined) { fields.push('persona_id = ?'); values.push(updates.persona_id); }

  if (fields.length === 0) return getQuiz(quizId);

  values.push(quizId);
  await pool.execute(`UPDATE quizzes SET ${fields.join(', ')} WHERE id = ?`, values);
  return getQuiz(quizId);
}

async function deleteQuiz(quizId) {
  await pool.execute('DELETE FROM quiz_attempts WHERE quiz_id = ?', [quizId]);
  await pool.execute('DELETE FROM quizzes WHERE id = ?', [quizId]);
  return { ok: true };
}

async function startAttempt(quizId, userId, personaId) {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (quiz.status !== 'active') throw new Error('Quiz is not active');

  const settings = quiz.settings || {};
  if (settings.maxAttempts) {
    const [prev] = await pool.execute(
      'SELECT COUNT(*) as total FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?',
      [quizId, userId]
    );
    if (prev[0].total >= settings.maxAttempts) {
      throw new Error('Maximum attempts reached');
    }
  }

  const id = 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  await pool.execute(
    'INSERT INTO quiz_attempts (id, quiz_id, user_id, persona_id, answers, score, max_score, started_at) VALUES (?, ?, ?, ?, ?, 0, 0, NOW())',
    [id, quizId, userId, personaId || null, JSON.stringify([])]
  );

  const questions = quiz.questions || [];
  const safeQuestions = questions.map(q => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options,
    timeLimit: q.timeLimit,
    image: q.image,
    media: q.media,
    required: q.required,
  }));

  return {
    attemptId: id,
    quizId,
    title: quiz.title,
    description: quiz.description,
    quizType: quiz.quiz_type,
    questions: safeQuestions,
    timeLimit: quiz.time_limit_seconds,
    totalQuestions: questions.length,
    xpReward: quiz.xp_reward,
  };
}

async function submitAttempt(attemptId, { answers, timeTakenSeconds }) {
  const [attemptRows] = await pool.execute(
    'SELECT * FROM quiz_attempts WHERE id = ?',
    [attemptId]
  );
  if (attemptRows.length === 0) throw new Error('Attempt not found');
  const attempt = attemptRows[0];

  if (attempt.completed_at) throw new Error('Attempt already completed');

  const quiz = await getQuiz(attempt.quiz_id);
  if (!quiz) throw new Error('Quiz not found');

  const questions = quiz.questions || [];
  const userAnswers = Array.isArray(answers) ? answers : [];
  let score = 0;
  let maxScore = 0;
  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const points = q.points || 1;
    maxScore += points;
    const userAnswer = userAnswers.find(a => a.questionId === q.id);

    if (!userAnswer || userAnswer.skipped) {
      results.push({
        questionId: q.id,
        correct: false,
        points: 0,
        maxPoints: points,
        selected: null,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        skipped: true,
      });
      continue;
    }

    let correct = false;
    if (q.type === 'multiple_choice' || q.type === 'true_false') {
      const selected = Array.isArray(userAnswer.answer) ? userAnswer.answer : [userAnswer.answer];
      const correctAnswers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      correct = selected.sort().join(',') === correctAnswers.sort().join(',');
    } else if (q.type === 'ordered') {
      const selected = Array.isArray(userAnswer.answer) ? userAnswer.answer : [];
      const correctOrder = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      correct = selected.join(',') === correctOrder.join(',');
    } else if (q.type === 'fill_blank') {
      const trimmed = (userAnswer.answer || '').toString().trim().toLowerCase();
      const acceptable = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
      correct = acceptable.some(a => trimmed === a.toString().trim().toLowerCase());
    } else if (q.type === 'open_ended' || q.type === 'survey') {
      correct = true;
    }

    const earnedPoints = correct ? points : 0;
    score += earnedPoints;

    results.push({
      questionId: q.id,
      correct,
      points: earnedPoints,
      maxPoints: points,
      selected: userAnswer.answer,
      correctAnswer: q.type !== 'open_ended' && q.type !== 'survey' ? q.correctAnswer : undefined,
      explanation: q.explanation,
      skipped: false,
    });
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percentage >= (quiz.settings?.passingScore || 60);

  await pool.execute(
    `UPDATE quiz_attempts SET answers = ?, score = ?, max_score = ?, percentage = ?, passed = ?, time_taken_seconds = ?, completed_at = NOW() WHERE id = ?`,
    [JSON.stringify(userAnswers), score, maxScore, percentage, passed ? 1 : 0, timeTakenSeconds || null, attemptId]
  );

  let xpEarned = 0;
  let badgeEarned = null;

  if (passed) {
    try {
      const xpResult = await gamification.addXp(
        attempt.user_id,
        attempt.persona_id || quiz.persona_id || 'default',
        quiz.xp_reward || 10,
        `quiz_completed:${quiz.id}`
      );
      xpEarned = xpResult.xp;

      if (quiz.badge_id) {
        badgeEarned = await gamification.addBadge(
          attempt.user_id,
          attempt.persona_id || quiz.persona_id || 'default',
          quiz.badge_id,
          quiz.badge_id.replace(/_/g, ' ')
        );
      }
    } catch (err) {
      console.error('[Quiz] XP/badge error:', err.message);
    }
  }

  try {
    const events = require('../events');
    await events.emit('on_quiz_completed', {
      userId: attempt.user_id,
      personaId: attempt.persona_id || quiz.persona_id,
      quizId: quiz.id,
      attemptId,
      score,
      maxScore,
      percentage,
      passed,
      timeTakenSeconds,
    });
  } catch {}

  return {
    attemptId,
    quizId: quiz.id,
    score,
    maxScore,
    percentage,
    passed,
    results,
    xpEarned,
    badgeEarned,
    totalQuestions: questions.length,
    correctQuestions: results.filter(r => r.correct).length,
  };
}

async function getAttempt(attemptId) {
  const [rows] = await pool.execute('SELECT * FROM quiz_attempts WHERE id = ?', [attemptId]);
  if (rows.length === 0) return null;
  return deserializeAttempt(rows[0]);
}

async function listAttempts({ quiz_id, user_id, persona_id, page, limit } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM quiz_attempts WHERE 1=1';
  const params = [];

  if (quiz_id) { query += ' AND quiz_id = ?'; params.push(quiz_id); }
  if (user_id) { query += ' AND user_id = ?'; params.push(user_id); }
  if (persona_id) { query += ' AND persona_id = ?'; params.push(persona_id); }

  query += ` ORDER BY completed_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

  const [rows] = await pool.execute(query, params);
  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM quiz_attempts WHERE 1=1');

  return {
    attempts: rows.map(deserializeAttempt),
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function getQuizStats(quizId) {
  const [attemptRows] = await pool.execute(
    'SELECT COUNT(*) as total, AVG(percentage) as avg_score, AVG(time_taken_seconds) as avg_time, SUM(passed) as passed_count FROM quiz_attempts WHERE quiz_id = ? AND completed_at IS NOT NULL',
    [quizId]
  );
  const stats = attemptRows[0];
  return {
    totalAttempts: stats.total || 0,
    averageScore: Math.round(stats.avg_score || 0),
    averageTimeSeconds: Math.round(stats.avg_time || 0),
    passRate: stats.total > 0 ? Math.round(((stats.passed_count || 0) / stats.total) * 100) : 0,
  };
}

async function getActiveQuizzes(personaId) {
  let query = "SELECT * FROM quizzes WHERE status = 'active'";
  const params = [];
  if (personaId) {
    query += ' AND (persona_id = ? OR persona_id IS NULL)';
    params.push(personaId);
  }
  query += ' ORDER BY created_at DESC';
  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeQuiz);
}

async function getUserQuizProgress(userId, personaId) {
  const [attempts] = await pool.execute(
    'SELECT quiz_id, MAX(percentage) as best_score, COUNT(*) as attempts_count FROM quiz_attempts WHERE user_id = ? AND completed_at IS NOT NULL GROUP BY quiz_id',
    [userId]
  );
  return attempts.map(a => ({
    quizId: a.quiz_id,
    bestScore: Math.round(a.best_score || 0),
    attemptsCount: a.attempts_count,
  }));
}

async function generateQuizFromPersona(personaId, topic, questionCount = 5) {
  const personaManager = require('../persona/manager');
  const persona = await personaManager.getPersona(personaId);
  if (!persona) throw new Error('Persona not found');

  const { callLLM } = require('../llm/integrationManager');
  const prompt = `You are a quiz generator for the persona "${persona.name}". Create a quiz about "${topic}" with ${questionCount} questions.
  
Each question must be a JSON object with:
- id: unique string like "q1", "q2"...
- text: the question text in Portuguese (pt-BR)
- type: "multiple_choice", "true_false", "fill_blank", or "ordered"
- options: array of options (for multiple_choice and true_false)
- correctAnswer: the correct answer(s)
- explanation: brief explanation of the correct answer
- points: points value (default 1)

Return ONLY a JSON array of questions, no markdown, no explanation outside the JSON.`;

  const response = await callLLM(prompt, { temperature: 0.8 });
  let questions;
  try {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    questions = JSON.parse(cleaned);
    if (!Array.isArray(questions)) throw new Error('Not an array');
  } catch {
    questions = [{
      id: 'q1', text: topic, type: 'multiple_choice',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctAnswer: 'Option A', explanation: 'Generated quiz', points: 1,
    }];
  }

  const quiz = await createQuiz({
    persona_id: personaId,
    title: `Quiz: ${topic}`,
    description: `Auto-generated quiz about ${topic} for ${persona.name}`,
    quiz_type: 'multiple_choice',
    questions,
    xp_reward: questionCount * 5,
    settings: { passingScore: 60, showResults: true, showExplanation: true, shuffleQuestions: true },
  });

  return quiz;
}

function deserializeQuiz(row) {
  return {
    id: row.id,
    persona_id: row.persona_id,
    title: row.title,
    description: row.description,
    quiz_type: row.quiz_type,
    questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : (row.questions || []),
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
    xp_reward: row.xp_reward || 10,
    badge_id: row.badge_id,
    time_limit_seconds: row.time_limit_seconds,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deserializeAttempt(row) {
  return {
    id: row.id,
    quiz_id: row.quiz_id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : (row.answers || []),
    score: row.score || 0,
    max_score: row.max_score || 0,
    percentage: row.percentage || 0,
    passed: !!row.passed,
    time_taken_seconds: row.time_taken_seconds,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

module.exports = {
  createQuiz,
  getQuiz,
  listQuizzes,
  updateQuiz,
  deleteQuiz,
  startAttempt,
  submitAttempt,
  getAttempt,
  listAttempts,
  getQuizStats,
  getActiveQuizzes,
  getUserQuizProgress,
  generateQuizFromPersona,
  QUIZ_TYPES,
  QUIZ_STATUS,
};