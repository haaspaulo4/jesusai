const { pool } = require('../db');
const { getSetting } = require('../settings');
const { getProfile, saveProfile } = require('../memory/profile');
const { createUser } = require('../auth');

const DEFAULT_ONBOARDING_STEPS = [
  { step_key: 'name', step_order: 1, question: 'Como posso te chamar?', question_en: 'What should I call you?', question_es: '¿Cómo puedo llamarte?', field: 'name', field_type: 'text', required: true },
  { step_key: 'interest', step_order: 2, question: 'O que te trouxe aqui? Qual assunto mais te interessa?', question_en: 'What brought you here? What topic interests you most?', question_es: '¿Qué te trajo aquí? ¿Qué tema te interesa más?', field: 'topics', field_type: 'choice', choices: ['fé', 'paz', 'família', ' propósito', 'perdão', 'cura', 'sabedoria', 'outro'], required: true },
  { step_key: 'feeling', step_order: 3, question: 'Como você está se sentindo hoje?', question_en: 'How are you feeling today?', question_es: '¿Cómo te sientes hoy?', field: 'emotions', field_type: 'choice', choices: ['ansioso', 'triste', 'esperançoso', 'grato', 'perdido', 'feliz', 'com dúvidas'], required: false },
  { step_key: 'email', step_order: 4, question: 'Quer receber devocionais e mensagens? Deixe seu email (opcional):', question_en: 'Want to receive devotionals and messages? Leave your email (optional):', question_es: '¿Quieres recibir devocionales? Deja tu email (opcional):', field: 'email', field_type: 'email', required: false },
];

async function getOnboardingSteps() {
  const [rows] = await pool.execute('SELECT * FROM onboarding_steps WHERE is_active = 1 ORDER BY step_order ASC');
  if (rows.length > 0) {
    return rows.map(row => ({
      ...row,
      choices: typeof row.choices === 'string' ? JSON.parse(row.choices || '[]') : (row.choices || []),
      isActive: !!row.is_active,
    }));
  }
  return DEFAULT_ONBOARDING_STEPS;
}

async function getUserOnboardingStatus(userId) {
  const [rows] = await pool.execute('SELECT step_key, answer FROM user_onboarding WHERE user_id = ?', [userId]);
  const completed = {};
  for (const row of rows) {
    completed[row.step_key] = row.answer;
  }

  const steps = await getOnboardingSteps();
  const nextStep = steps.find(s => !completed[s.step_key]);

  return {
    completed,
    nextStep: nextStep || null,
    progress: steps.length > 0 ? Object.keys(completed).length / steps.length : 1,
    done: !nextStep,
  };
}

async function saveOnboardingAnswer(userId, stepKey, answer) {
  await pool.execute(
    'INSERT INTO user_onboarding (user_id, step_key, answer) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE answer = VALUES(answer), answered_at = NOW()',
    [userId, stepKey, answer]
  );

  const steps = await getOnboardingSteps();
  const step = steps.find(s => s.step_key === stepKey);
  if (!step) return { ok: true, nextStep: null };

  const profile = await getProfile(userId);

  if (step.field === 'name' || step.field === 'email' || step.field === 'phone') {
    await pool.execute(`UPDATE users SET ${step.field === 'name' ? 'name' : step.field} = ? WHERE id = ?`, [answer, userId]);
  }

  if (step.field === 'name' && answer) {
    profile.name = answer;
  }
  if (step.field === 'topics' && answer) {
    const topics = Array.isArray(answer) ? answer : [answer];
    profile.topics = [...new Set([...(profile.topics || []), ...topics])];
  }
  if (step.field === 'emotions' && answer) {
    const emotions = Array.isArray(answer) ? answer : [answer];
    profile.emotions = [...new Set([...(profile.emotions || []), ...emotions])];
  }
  if (step.field === 'spiritual_journey' && answer) {
    profile.spiritualJourney = answer;
  }
  if (step.field === 'email') {
    await pool.execute('UPDATE users SET email = COALESCE(?, email) WHERE id = ? AND (email IS NULL OR email = ?)', [answer, userId, '']);
  }

  await saveProfile(profile);

  const status = await getUserOnboardingStatus(userId);
  return { ok: true, nextStep: status.nextStep, progress: status.progress, done: status.done };
}

async function shouldOnboard(userId) {
  const enabled = await getSetting('onboarding_enabled', 'true');
  if (enabled !== 'true') return null;

  const status = await getUserOnboardingStatus(userId);
  if (status.done) return null;
  return status.nextStep;
}

function formatOnboardingQuestion(step, lang = 'pt-BR') {
  if (!step) return null;
  const l = lang.startsWith('en') ? 'en' : (lang.startsWith('es') ? 'es' : 'pt');
  let question = step[`question${l === 'pt' ? '' : l === 'en' ? '_en' : '_es'}`] || step.question;
  if (!question) question = step.question;

  let msg = question;
  if (step.choices && step.choices.length > 0) {
    msg += '\n\n' + step.choices.map((c, i) => `${i + 1}. ${c}`).join('\n');
    msg += '\n\n_Responda com o número ou texto_';
  }
  return msg;
}

function parseOnboardingAnswer(step, rawAnswer) {
  if (!step) return rawAnswer;
  if (step.choices && step.choices.length > 0) {
    const num = parseInt(rawAnswer.trim());
    if (!isNaN(num) && num >= 1 && num <= step.choices.length) {
      return step.choices[num - 1];
    }
    const matched = step.choices.find(c =>
      c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') ===
      rawAnswer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    if (matched) return matched;
    return rawAnswer.trim();
  }
  return rawAnswer.trim();
}

async function ensureUser(userId, userName, source = 'web') {
  const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [userId]);
  if (rows.length > 0) return userId;

  const name = userName || userId.replace(/^(wa_|tg_|user_)/, '');
  const email = `${userId}@${source}.bot`;
  const role = 'user';
  await pool.execute(
    'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
    [userId, email, name, role]
  );
  return userId;
}

async function createOnboardingStep(data) {
  const { step_key, step_order, question, question_en, question_es, field, field_type, choices, required } = data;
  await pool.execute(
    'INSERT INTO onboarding_steps (step_key, step_order, question, question_en, question_es, field, field_type, choices, required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE step_order=VALUES(step_order), question=VALUES(question), question_en=VALUES(question_en), question_es=VALUES(question_es), field=VALUES(field), field_type=VALUES(field_type), choices=VALUES(choices), required=VALUES(required)',
    [step_key, step_order || 0, question, question_en || null, question_es || null, field, field_type || 'text', JSON.stringify(choices || []), required !== false ? 1 : 0]
  );
  return { step_key, ok: true };
}

async function deleteOnboardingStep(stepKey) {
  await pool.execute('DELETE FROM onboarding_steps WHERE step_key = ?', [stepKey]);
  return { ok: true };
}

async function resetOnboardingSteps() {
  await pool.execute('DELETE FROM onboarding_steps');
  for (const step of DEFAULT_ONBOARDING_STEPS) {
    await pool.execute(
      'INSERT INTO onboarding_steps (step_key, step_order, question, question_en, question_es, field, field_type, choices, required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [step.step_key, step.step_order, step.question, step.question_en, step.question_es, step.field, step.field_type, JSON.stringify(step.choices || []), step.required ? 1 : 0]
    );
  }
  return { ok: true, count: DEFAULT_ONBOARDING_STEPS.length };
}

module.exports = {
  getOnboardingSteps,
  getUserOnboardingStatus,
  saveOnboardingAnswer,
  shouldOnboard,
  formatOnboardingQuestion,
  parseOnboardingAnswer,
  ensureUser,
  createOnboardingStep,
  deleteOnboardingStep,
  resetOnboardingSteps,
};