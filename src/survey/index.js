const { pool } = require('../db');
const { getSetting } = require('../settings');

async function createSurvey({ title, description, questions, triggerType, triggerConfig }) {
  const id = 'survey_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  await pool.execute(
    'INSERT INTO surveys (id, title, description, questions, trigger_type, trigger_config) VALUES (?, ?, ?, ?, ?, ?)',
    [id, title, description || null, JSON.stringify(questions), triggerType || 'manual', JSON.stringify(triggerConfig || {})]
  );
  return getSurvey(id);
}

async function getSurvey(surveyId) {
  const [rows] = await pool.execute('SELECT * FROM surveys WHERE id = ?', [surveyId]);
  if (rows.length === 0) return null;
  const row = rows[0];
  row.questions = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions;
  row.triggerConfig = typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : row.trigger_config;
  row.isActive = !!row.is_active;
  delete row.trigger_config;
  return row;
}

async function listSurveys({ activeOnly, page, limit } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM surveys WHERE 1=1';
  const params = [];

  if (activeOnly) {
    query += ' AND is_active = 1';
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute(query, params);
  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM surveys');

  return {
    surveys: rows.map(row => {
      row.questions = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions;
      row.triggerConfig = typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : row.trigger_config;
      row.isActive = !!row.is_active;
      delete row.trigger_config;
      return row;
    }),
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function updateSurvey(surveyId, updates) {
  const fields = [];
  const values = [];

  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.questions !== undefined) { fields.push('questions = ?'); values.push(JSON.stringify(updates.questions)); }
  if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (updates.triggerType !== undefined) { fields.push('trigger_type = ?'); values.push(updates.triggerType); }
  if (updates.triggerConfig !== undefined) { fields.push('trigger_config = ?'); values.push(JSON.stringify(updates.triggerConfig)); }

  if (fields.length === 0) return getSurvey(surveyId);

  values.push(surveyId);
  await pool.execute(`UPDATE surveys SET ${fields.join(', ')} WHERE id = ?`, values);
  return getSurvey(surveyId);
}

async function deleteSurvey(surveyId) {
  await pool.execute('DELETE FROM surveys WHERE id = ?', [surveyId]);
}

async function submitSurveyResponse({ surveyId, userId, sessionId, answers }) {
  await pool.execute(
    'INSERT INTO survey_responses (survey_id, user_id, session_id, answers) VALUES (?, ?, ?, ?)',
    [surveyId, userId, sessionId || null, JSON.stringify(answers)]
  );

  try {
    const [rows] = await pool.execute('SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = ?', [surveyId]);
    const responseCount = rows[0].total;
    if (responseCount > 0 && responseCount % 10 === 0) {
      console.log(`[Survey] Survey ${surveyId} reached ${responseCount} responses`);
    }
  } catch {}

  return { ok: true };
}

async function getSurveyResponses(surveyId, { page, limit } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  const [rows] = await pool.execute(
    'SELECT * FROM survey_responses WHERE survey_id = ? ORDER BY completed_at DESC LIMIT ? OFFSET ?',
    [surveyId, limit, offset]
  );
  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM survey_responses WHERE survey_id = ?', [surveyId]);

  return {
    responses: rows.map(row => {
      row.answers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
      return row;
    }),
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function createRating({ userId, sessionId, messageId, rating, feedback, category, source }) {
  await pool.execute(
    'INSERT INTO ratings (user_id, session_id, message_id, rating, feedback, category, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, sessionId || null, messageId || null, rating, feedback || null, category || 'general', source || 'web']
  );
  return { ok: true };
}

async function getRatings({ category, source, userId, page, limit } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT r.*, u.name as user_name, u.email as user_email FROM ratings r LEFT JOIN users u ON r.user_id = u.id WHERE 1=1';
  const params = [];

  if (category) { query += ' AND r.category = ?'; params.push(category); }
  if (source) { query += ' AND r.source = ?'; params.push(source); }
  if (userId) { query += ' AND r.user_id = ?'; params.push(userId); }

  query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute(query, params);

  let countQuery = 'SELECT COUNT(*) as total FROM ratings WHERE 1=1';
  const countParams = [];
  if (category) { countQuery += ' AND category = ?'; countParams.push(category); }
  if (source) { countQuery += ' AND source = ?'; countParams.push(source); }
  if (userId) { countQuery += ' AND user_id = ?'; countParams.push(userId); }

  const [totalResult] = await pool.execute(countQuery, countParams);

  const [avgResult] = await pool.execute('SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM ratings');
  const [distResult] = await pool.execute('SELECT rating, COUNT(*) as count FROM ratings GROUP BY rating ORDER BY rating DESC');

  return {
    ratings: rows,
    total: totalResult[0].total,
    page,
    limit,
    average: avgResult[0].avg_rating ? parseFloat(avgResult[0].avg_rating.toFixed(2)) : 0,
    totalRatings: avgResult[0].total,
    distribution: distResult.reduce((acc, r) => { acc[r.rating] = r.count; return acc; }, {}),
  };
}

async function createFollowUp({ userId, sessionId, type, question, scheduledAt }) {
  await pool.execute(
    'INSERT INTO follow_ups (user_id, session_id, type, question, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, sessionId || null, type, question, scheduledAt || null, scheduledAt ? 'scheduled' : 'pending']
  );
  return { ok: true };
}

async function getPendingFollowUps({ userId, type, limit } = {}) {
  limit = limit || 10;

  let query = "SELECT * FROM follow_ups WHERE status IN ('pending', 'scheduled') AND (scheduled_at IS NULL OR scheduled_at <= NOW())";
  const params = [];

  if (userId) { query += ' AND user_id = ?'; params.push(userId); }
  if (type) { query += ' AND type = ?'; params.push(type); }

  query += ' ORDER BY created_at ASC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.execute(query, params);
  return rows;
}

async function respondFollowUp(followUpId, response) {
  await pool.execute(
    'UPDATE follow_ups SET response = ?, status = ?, responded_at = NOW() WHERE id = ?',
    [response, 'completed', followUpId]
  );
  return { ok: true };
}

async function markFollowUpSent(followUpId) {
  await pool.execute(
    'UPDATE follow_ups SET sent_at = NOW(), status = ? WHERE id = ?',
    ['sent', followUpId]
  );
}

async function getFollowUps({ userId, status, type, page, limit } = {}) {
  page = page || 1;
  limit = limit || 20;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM follow_ups WHERE 1=1';
  const params = [];

  if (userId) { query += ' AND user_id = ?'; params.push(userId); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (type) { query += ' AND type = ?'; params.push(type); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const [rows] = await pool.execute(query, params);

  const [totalResult] = await pool.execute('SELECT COUNT(*) as total FROM follow_ups');
  return {
    followUps: rows,
    total: totalResult[0].total,
    page,
    limit,
  };
}

async function shouldTriggerSurvey(userId, sessionId) {
  const surveyEnabled = await getSetting('survey_enabled', 'true');
  if (surveyEnabled !== 'true') return null;

  const [activeSurveys] = await pool.execute(
    "SELECT * FROM surveys WHERE is_active = 1 AND trigger_type != 'manual'"
  );

  for (const survey of activeSurveys) {
    const config = typeof survey.trigger_config === 'string'
      ? JSON.parse(survey.trigger_config)
      : (survey.trigger_config || {});

    if (survey.trigger_type === 'after_messages') {
      const threshold = parseInt(config.threshold) || 5;
      const [msgRows] = await pool.execute(
        'SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ? AND m.role = ?',
        [userId, 'user']
      );
      if (msgRows[0].total > 0 && msgRows[0].total % threshold === 0) {
        const [existing] = await pool.execute(
          'SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?',
          [survey.id, userId]
        );
        if (existing.length === 0) return survey;
      }
    }

    if (survey.trigger_type === 'after_session') {
      const [existing] = await pool.execute(
        'SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?',
        [survey.id, userId]
      );
      if (existing.length === 0) return survey;
    }
  }

  return null;
}

async function shouldTriggerFollowUp(userId, sessionId) {
  const followUpEnabled = await getSetting('followup_enabled', 'true');
  if (followUpEnabled !== 'true') return null;

  const [pending] = await pool.execute(
    "SELECT * FROM follow_ups WHERE user_id = ? AND status IN ('pending', 'sent') AND (scheduled_at IS NULL OR scheduled_at <= NOW()) ORDER BY created_at ASC LIMIT 1",
    [userId]
  );

  return pending.length > 0 ? pending[0] : null;
}

async function autoCreateFollowUp(userId, sessionId) {
  const followUpEnabled = await getSetting('followup_enabled', 'true');
  if (followUpEnabled !== 'true') return null;

  const [recent] = await pool.execute(
    "SELECT id FROM follow_ups WHERE user_id = ? AND status IN ('pending', 'sent') AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1",
    [userId]
  );
  if (recent.length > 0) return null;

  const followUpInterval = parseInt(await getSetting('followup_interval_messages', '10')) || 10;
  const [msgRows] = await pool.execute(
    'SELECT COUNT(*) as total FROM messages m INNER JOIN sessions s ON m.session_id = s.id WHERE s.user_id = ? AND m.role = ?',
    [userId, 'user']
  );

  if (msgRows[0].total % followUpInterval !== 0) return null;

  const questions = [
    'Como você está se sentindo espiritualmente hoje?',
    'Posso orar por você de alguma forma específica?',
    'Há algo que gostaria de explorar mais profundamente na Palavra?',
    'Como posso ajudar você em sua jornada de fé?',
    'O que mais tem pesado no seu coração lately?',
  ];
  const question = questions[Math.floor(Math.random() * questions.length)];

  await createFollowUp({
    userId,
    sessionId,
    type: 'spiritual_check',
    question,
  });

  return question;
}

module.exports = {
  createSurvey,
  getSurvey,
  listSurveys,
  updateSurvey,
  deleteSurvey,
  submitSurveyResponse,
  getSurveyResponses,
  createRating,
  getRatings,
  createFollowUp,
  getPendingFollowUps,
  respondFollowUp,
  markFollowUpSent,
  getFollowUps,
  shouldTriggerSurvey,
  shouldTriggerFollowUp,
  autoCreateFollowUp,
};