const { pool } = require('../db');
const { getSetting } = require('../settings');

const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300, 19200, 21200, 23300, 25500, 27800, 30200, 32700, 35300, 38000, 40800, 44000, 48000, 53000, 59000, 66000, 74000, 83000, 93000, 104000, 116000];

const BADGE_RULES = [
  { id: 'first_message', name: { 'pt-BR': 'Primeira Mensagem', 'en-US': 'First Message', 'es-ES': 'Primer Mensaje' }, icon: '💬', condition: (xp) => xp.total_messages >= 1 },
  { id: 'streak_3', name: { 'pt-BR': 'Sequência de 3', 'en-US': '3-Day Streak', 'es-ES': 'Racha de 3' }, icon: '🔥', condition: (xp) => (xp.streak || 0) >= 3 },
  { id: 'streak_7', name: { 'pt-BR': 'Sequência de 7', 'en-US': '7-Day Streak', 'es-ES': 'Racha de 7' }, icon: '⚡', condition: (xp) => (xp.streak || 0) >= 7 },
  { id: 'streak_14', name: { 'pt-BR': 'Sequência de 14', 'en-US': '14-Day Streak', 'es-ES': 'Racha de 14' }, icon: '🌟', condition: (xp) => (xp.streak || 0) >= 14 },
  { id: 'streak_30', name: { 'pt-BR': 'Sequência de 30', 'en-US': '30-Day Streak', 'es-ES': 'Racha de 30' }, icon: '👑', condition: (xp) => (xp.streak || 0) >= 30 },
  { id: 'streak_100', name: { 'pt-BR': 'Sequência de 100', 'en-US': '100-Day Streak', 'es-ES': 'Racha de 100' }, icon: '💎', condition: (xp) => (xp.streak || 0) >= 100 },
  { id: 'level_5', name: { 'pt-BR': 'Nível 5', 'en-US': 'Level 5', 'es-ES': 'Nivel 5' }, icon: '⭐', condition: (xp) => (xp.level || 1) >= 5 },
  { id: 'level_10', name: { 'pt-BR': 'Nível 10', 'en-US': 'Level 10', 'es-ES': 'Nivel 10' }, icon: '🏆', condition: (xp) => (xp.level || 1) >= 10 },
  { id: 'level_20', name: { 'pt-BR': 'Nível 20', 'en-US': 'Level 20', 'es-ES': 'Nivel 20' }, icon: '🎖️', condition: (xp) => (xp.level || 1) >= 20 },
  { id: 'xp_100', name: { 'pt-BR': '100 XP', 'en-US': '100 XP', 'es-ES': '100 XP' }, icon: '🎯', condition: (xp) => (xp.xp || 0) >= 100 },
  { id: 'xp_500', name: { 'pt-BR': '500 XP', 'en-US': '500 XP', 'es-ES': '500 XP' }, icon: '🚀', condition: (xp) => (xp.xp || 0) >= 500 },
  { id: 'xp_1000', name: { 'pt-BR': '1.000 XP', 'en-US': '1K XP', 'es-ES': '1K XP' }, icon: '💯', condition: (xp) => (xp.xp || 0) >= 1000 },
  { id: 'xp_5000', name: { 'pt-BR': '5.000 XP', 'en-US': '5K XP', 'es-ES': '5K XP' }, icon: '💫', condition: (xp) => (xp.xp || 0) >= 5000 },
  { id: 'xp_10000', name: { 'pt-BR': '10.000 XP', 'en-US': '10K XP', 'es-ES': '10K XP' }, icon: '🏅', condition: (xp) => (xp.xp || 0) >= 10000 },
  { id: 'xp_50000', name: { 'pt-BR': '50.000 XP', 'en-US': '50K XP', 'es-ES': '50K XP' }, icon: '🌟', condition: (xp) => (xp.xp || 0) >= 50000 },
  { id: 'goals_1', name: { 'pt-BR': 'Primeira Meta', 'en-US': 'First Goal', 'es-ES': 'Primera Meta' }, icon: '📋', condition: (xp) => (xp.goals_completed || 0) >= 1 },
  { id: 'goals_5', name: { 'pt-BR': '5 Metas Cumpridas', 'en-US': '5 Goals Completed', 'es-ES': '5 Metas Cumplidas' }, icon: '📈', condition: (xp) => (xp.goals_completed || 0) >= 5 },
  { id: 'goals_10', name: { 'pt-BR': '10 Metas Cumpridas', 'en-US': '10 Goals Completed', 'es-ES': '10 Metas Cumplidas' }, icon: '🎓', condition: (xp) => (xp.goals_completed || 0) >= 10 },
  { id: 'curious', name: { 'pt-BR': 'Curioso', 'en-US': 'Curious Mind', 'es-ES': 'Curioso' }, icon: '🧐', condition: (xp) => (xp.total_messages || 0) >= 50 },
  { id: 'dedicated', name: { 'pt-BR': 'Dedicado', 'en-US': 'Dedicated', 'es-ES': 'Dedicado' }, icon: '💪', condition: (xp) => (xp.total_messages || 0) >= 100 },
  { id: 'veteran', name: { 'pt-BR': 'Veterano', 'en-US': 'Veteran', 'es-ES': 'Veterano' }, icon: '🏛️', condition: (xp) => (xp.total_messages || 0) >= 500 },
];

const XP_REASONS = {
  message: { base: 2, description: { 'pt-BR': 'Mensagem enviada', 'en-US': 'Message sent', 'es-ES': 'Mensaje enviado' } },
  streak_bonus: { base: 5, multiplier_per_day: true, description: { 'pt-BR': 'Bônus de sequência', 'en-US': 'Streak bonus', 'es-ES': 'Bono de racha' } },
  onboarding_complete: { base: 50, description: { 'pt-BR': 'Onboarding completo', 'en-US': 'Onboarding complete', 'es-ES': 'Onboarding completo' } },
  goal_completed: { base: 25, description: { 'pt-BR': 'Meta cumprida', 'en-US': 'Goal completed', 'es-ES': 'Meta completada' } },
  quiz_completed: { base: 15, description: { 'pt-BR': 'Quiz respondido', 'en-US': 'Quiz answered', 'es-ES': 'Cuestionario respondido' } },
  badge_earned: { base: 10, description: { 'pt-BR': 'Conquista desbloqueada', 'en-US': 'Badge unlocked', 'es-ES': 'Insignia desbloqueada' } },
  daily_login: { base: 5, description: { 'pt-BR': 'Login diário', 'en-US': 'Daily login', 'es-ES': 'Login diario' } },
  creative_produced: { base: 20, description: { 'pt-BR': 'Conteúdo criado', 'en-US': 'Content created', 'es-ES': 'Contenido creado' } },
  level_up_bonus: { base: 0, multiplier: true, description: { 'pt-BR': 'Bônus de level up', 'en-US': 'Level up bonus', 'es-ES': 'Bono de subida de nivel' } },
};

const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

async function getXp(userId, personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM user_xp WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  if (rows.length === 0) return { user_id: userId, persona_id: personaId, xp: 0, level: 1, streak: 0, best_streak: 0, last_activity: null, badges: [], total_messages: 0, goals_completed: 0 };
  const row = rows[0];
  let badges = row.badges;
  if (typeof badges === 'string') { try { badges = JSON.parse(badges); } catch { badges = []; } }
  return { ...row, badges: badges || [], total_messages: row.total_messages || 0, goals_completed: row.goals_completed || 0 };
}

async function addXp(userId, personaId, amount, reason) {
  const previous = await getXp(userId, personaId);
  const previousXp = previous.xp || 0;
  const previousLevel = calculateLevel(previousXp);

  const streakMultiplier = 1 + Math.min((previous.streak || 0) * 0.05, 0.5);
  const effectiveAmount = (reason === 'streak_bonus' || reason?.startsWith('streak_day_')) ? amount : Math.round(amount * streakMultiplier);

  await pool.execute(
    `INSERT INTO user_xp (user_id, persona_id, xp, level, streak, best_streak, last_activity, badges)
     VALUES (?, ?, ?, 1, 0, 0, NOW(), '[]')
     ON DUPLICATE KEY UPDATE xp = xp + ?, last_activity = NOW()`,
    [userId, personaId, effectiveAmount, effectiveAmount]
  );

  const current = await getXp(userId, personaId);
  const newLevel = calculateLevel(current.xp);
  const leveledUp = newLevel > previousLevel;

  if (newLevel !== current.level) {
    const levelBonus = newLevel * 10;
    await pool.execute('UPDATE user_xp SET level = ? WHERE user_id = ? AND persona_id = ?', [newLevel, userId, personaId]);
    if (leveledUp && levelBonus > 0) {
      await pool.execute(
        'INSERT INTO user_xp_log (user_id, persona_id, amount, reason, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, personaId, levelBonus, `level_up_bonus_${newLevel}`]
      );
      await pool.execute('UPDATE user_xp SET xp = xp + ? WHERE user_id = ? AND persona_id = ?', [levelBonus, userId, personaId]);
      current.xp += levelBonus;
    }
    current.level = newLevel;
  }

  if (reason) {
    await pool.execute(
      'INSERT INTO user_xp_log (user_id, persona_id, amount, reason, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, personaId, effectiveAmount, reason]
    );
  }

  if (leveledUp) {
    try { const events = require('../events'); await events.emit('on_level_up', { userId, personaId, newLevel, previousLevel, xp: current.xp }); } catch {}
  }

  for (const milestone of MILESTONES) {
    if (previousXp < milestone && current.xp >= milestone) {
      try { const events = require('../events'); await events.emit('on_xp_milestone', { userId, personaId, milestone, xp: current.xp }); } catch {}
    }
  }

  return { xp: current.xp, level: newLevel, leveledUp, previousLevel, streak: current.streak || 0, xpGained: effectiveAmount, streakMultiplier: streakMultiplier };
}

async function awardMessageXp(userId, personaId) {
  const perMsgXp = parseInt(await getSetting('xp_per_message', '2')) || 2;
  const result = await addXp(userId, personaId, perMsgXp, 'message');
  try {
    await pool.execute('UPDATE user_xp SET total_messages = total_messages + 1 WHERE user_id = ? AND persona_id = ?', [userId, personaId]);
  } catch {}
  return result;
}

async function awardGoalXp(userId, personaId) {
  const goalXp = parseInt(await getSetting('xp_per_goal', '25')) || 25;
  await addXp(userId, personaId, goalXp, 'goal_completed');
  try {
    await pool.execute('UPDATE user_xp SET goals_completed = goals_completed + 1 WHERE user_id = ? AND persona_id = ?', [userId, personaId]);
  } catch {}
}

async function updateStreak(userId, personaId) {
  const current = await getXp(userId, personaId);
  const lastActivity = current.last_activity;
  const streakGraceDays = parseInt(await getSetting('streak_grace_days', '1')) || 1;
  const today = new Date().toISOString().slice(0, 10);

  if (!lastActivity) {
    await pool.execute(
      'UPDATE user_xp SET streak = 1, best_streak = GREATEST(best_streak, 1), last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
      [userId, personaId]
    );
    return { streak: 1, bestStreak: Math.max(current.best_streak || 0, 1), streakBroken: false, streakSaved: false };
  }

  const lastDate = new Date(lastActivity).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (lastDate === today) {
    return { streak: current.streak || 0, bestStreak: current.best_streak || 0, streakBroken: false, streakSaved: false };
  }

  if (lastDate === yesterday) {
    const newStreak = (current.streak || 0) + 1;
    const newBest = Math.max(current.best_streak || 0, newStreak);
    const streakBonus = 5 + Math.min(newStreak, 50);
    await pool.execute(
      'UPDATE user_xp SET streak = ?, best_streak = ?, last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
      [newStreak, newBest, userId, personaId]
    );
    await addXp(userId, personaId, streakBonus, `streak_day_${newStreak}`);
    try { const events = require('../events'); await events.emit('on_streak_update', { userId, personaId, streak: newStreak, bestStreak: newBest, bonus: streakBonus }); } catch {}
    return { streak: newStreak, bestStreak: newBest, streakBroken: false, streakSaved: false, bonus: streakBonus };
  }

  const lastDateObj = new Date(lastDate);
  const todayObj = new Date(today);
  const diffDays = Math.floor((todayObj - lastDateObj) / 86400000);

  if (diffDays <= streakGraceDays && current.streak > 0) {
    const streakBonus = 5;
    await pool.execute(
      'UPDATE user_xp SET streak = ?, last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
      [current.streak, userId, personaId]
    );
    await addXp(userId, personaId, streakBonus, 'streak_saved');
    return { streak: current.streak, bestStreak: current.best_streak || 0, streakBroken: false, streakSaved: true, bonus: streakBonus };
  }

  const previousStreak = current.streak || 0;
  await pool.execute(
    'UPDATE user_xp SET streak = 1, best_streak = GREATEST(best_streak, 1), last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  try { const events = require('../events'); await events.emit('on_streak_update', { userId, personaId, streak: 1, bestStreak: current.best_streak || 1, previousStreak, streakBroken: true }); } catch {}
  return { streak: 1, bestStreak: current.best_streak || 0, streakBroken: true, previousStreak };
}

async function addBadge(userId, personaId, badgeId, badgeName) {
  const current = await getXp(userId, personaId);
  let badges = current.badges || [];
  if (badges.some(b => b.id === badgeId)) return current;

  const rule = BADGE_RULES.find(r => r.id === badgeId);
  const displayName = typeof badgeName === 'object' ? (badgeName['pt-BR'] || badgeName['en-US'] || badgeId) : badgeName;
  const icon = rule?.icon || '🏆';
  badges.push({ id: badgeId, name: displayName, icon, earnedAt: new Date().toISOString() });
  await pool.execute(
    'UPDATE user_xp SET badges = ? WHERE user_id = ? AND persona_id = ?',
    [JSON.stringify(badges), userId, personaId]
  );

  const badgeXp = parseInt(await getSetting('xp_per_badge', '10')) || 10;
  await addXp(userId, personaId, badgeXp, `badge_${badgeId}`);
  return { ...current, badges };
}

async function removeBadge(userId, personaId, badgeId) {
  const current = await getXp(userId, personaId);
  const badges = (current.badges || []).filter(b => b.id !== badgeId);
  await pool.execute(
    'UPDATE user_xp SET badges = ? WHERE user_id = ? AND persona_id = ?',
    [JSON.stringify(badges), userId, personaId]
  );
  return { ...current, badges };
}

async function getLeaderboard(personaId, limit = 10) {
  let sql = 'SELECT * FROM user_xp WHERE 1=1';
  const values = [];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  sql += ' ORDER BY xp DESC';
  if (limit) { sql += ` LIMIT ${Number(limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows.map(r => {
    let badges = r.badges;
    if (typeof badges === 'string') { try { badges = JSON.parse(badges); } catch { badges = []; } }
    return { ...r, badges: badges || [] };
  });
}

async function getXpLog(userId, personaId, limit = 50) {
  let sql = 'SELECT * FROM user_xp_log WHERE user_id = ?';
  const values = [userId];
  if (personaId) { sql += ' AND persona_id = ?'; values.push(personaId); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ` LIMIT ${Number(limit)}`; }
  const [rows] = await pool.execute(sql, values);
  return rows;
}

async function checkAndAwardBadges(userId, personaId) {
  const xp = await getXp(userId, personaId);
  const awarded = [];

  for (const rule of BADGE_RULES) {
    if (rule.condition(xp) && !xp.badges.some(b => b.id === rule.id)) {
      const lang = 'pt-BR';
      const badgeName = rule.name[lang] || rule.name['en-US'] || rule.id;
      await addBadge(userId, personaId, rule.id, badgeName);
      awarded.push({ id: rule.id, name: badgeName, icon: rule.icon });
      try { const events = require('../events'); await events.emit('on_badge_earned', { userId, personaId, badgeId: rule.id, badgeName, icon: rule.icon }); } catch {}
    }
  }
  return awarded;
}

function calculateLevel(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function getXpForNextLevel(currentXp) {
  const level = calculateLevel(currentXp);
  if (level >= LEVEL_THRESHOLDS.length) {
    const lastThreshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    const nextLevelXp = lastThreshold + (currentXp - lastThreshold) + 5000;
    return { needed: nextLevelXp, remaining: nextLevelXp - currentXp, level };
  }
  const nextThreshold = LEVEL_THRESHOLDS[level];
  return { needed: nextThreshold, remaining: nextThreshold - currentXp, level };
}

function getLevelTitle(level, lang = 'pt-BR') {
  const titles = {
    'pt-BR': ['Iniciante', 'Aprendiz', 'Novato', 'Explorador', 'Conhecedor', 'Experimentado', 'Veterano', 'Especialista', 'Mestre', 'Lendário', 'Sábio', 'Iluminado', 'Transcendente', 'Divino', 'Supremo', 'Absoluto', 'Eterno', 'Cósmico', 'Onisciente', 'Onipotente'],
    'en-US': ['Beginner', 'Apprentice', 'Novice', 'Explorer', 'Knowledgeable', 'Experienced', 'Veteran', 'Specialist', 'Master', 'Legendary', 'Wise', 'Enlightened', 'Transcendent', 'Divine', 'Supreme', 'Absolute', 'Eternal', 'Cosmic', 'Omniscient', 'Omnipotent'],
    'es-ES': ['Principiante', 'Aprendiz', 'Novato', 'Explorador', 'Conocedor', 'Experimentado', 'Veterano', 'Especialista', 'Maestro', 'Legendario', 'Sabio', 'Iluminado', 'Trascendente', 'Divino', 'Supremo', 'Absoluto', 'Eterno', 'Cósmico', 'Omnisciente', 'Omnipotente'],
  };
  const list = titles[lang] || titles['pt-BR'];
  return list[Math.min(level - 1, list.length - 1)];
}

function formatXpContext(xpData, lang = 'pt-BR') {
  if (!xpData) return '';
  const level = xpData.level || 1;
  const xp = xpData.xp || 0;
  const streak = xpData.streak || 0;
  const nextLevel = getXpForNextLevel(xp);
  const title = getLevelTitle(level, lang);
  const badges = (xpData.badges || []).map(b => b.icon || '🏆').join(' ');

  if (lang === 'en-US') {
    return `GAMIFICATION: Level ${level} "${title}", ${xp} XP${nextLevel.remaining > 0 && nextLevel.remaining !== Infinity ? `, ${nextLevel.remaining} XP to next` : ''}, Streak: ${streak} days${badges ? `, Badges: ${badges}` : ''}`;
  }
  if (lang === 'es-ES') {
    return `GAMIFICACIÓN: Nivel ${level} "${title}", ${xp} XP${nextLevel.remaining > 0 && nextLevel.remaining !== Infinity ? `, ${nextLevel.remaining} XP para el siguiente` : ''}, Racha: ${streak} días${badges ? `, Insignias: ${badges}` : ''}`;
  }
  return `GAMIFICAÇÃO: Nível ${level} "${title}", ${xp} XP${nextLevel.remaining > 0 && nextLevel.remaining !== Infinity ? `, ${nextLevel.remaining} XP para o próximo` : ''}, Streak: ${streak} dias${badges ? `, Conquistas: ${badges}` : ''}`;
}

function getXpReasonDescription(reason, lang = 'pt-BR') {
  if (!reason) return '';
  if (reason.startsWith('streak_day_')) {
    const day = reason.replace('streak_day_', '');
    return lang === 'en-US' ? `Day ${day} streak bonus` : lang === 'es-ES' ? `Bono racha día ${day}` : `Bônus sequência dia ${day}`;
  }
  if (reason.startsWith('badge_')) return lang === 'en-US' ? 'Badge unlocked' : lang === 'es-ES' ? 'Insignia desbloqueada' : 'Conquista desbloqueada';
  if (reason.startsWith('level_up_bonus_')) return lang === 'en-US' ? 'Level up bonus' : lang === 'es-ES' ? 'Bono de nivel' : 'Bônus de level up';

  const entry = XP_REASONS[reason];
  if (entry?.description?.[lang]) return entry.description[lang];
  return reason;
}

module.exports = {
  getXp, addXp, updateStreak, addBadge, removeBadge,
  getLeaderboard, getXpLog, checkAndAwardBadges,
  calculateLevel, getXpForNextLevel, formatXpContext,
  awardMessageXp, awardGoalXp, getXpReasonDescription,
  getLevelTitle, LEVEL_THRESHOLDS, BADGE_RULES, MILESTONES,
};