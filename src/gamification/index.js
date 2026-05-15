const { pool } = require('../db');

async function getXp(userId, personaId) {
  const [rows] = await pool.execute(
    'SELECT * FROM user_xp WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  if (rows.length === 0) return { user_id: userId, persona_id: personaId, xp: 0, level: 1, streak: 0, best_streak: 0, last_activity: null, badges: [] };
  const row = rows[0];
  let badges = row.badges;
  if (typeof badges === 'string') { try { badges = JSON.parse(badges); } catch { badges = []; } }
  return { ...row, badges: badges || [] };
}

async function addXp(userId, personaId, amount, reason) {
  await pool.execute(
    `INSERT INTO user_xp (user_id, persona_id, xp, level, streak, best_streak, last_activity, badges)
     VALUES (?, ?, ?, 1, 0, 0, NOW(), '[]')
     ON DUPLICATE KEY UPDATE xp = xp + ?, last_activity = NOW()`,
    [userId, personaId, amount, amount]
  );

  const current = await getXp(userId, personaId);
  const newLevel = calculateLevel(current.xp);
  if (newLevel !== current.level) {
    await pool.execute('UPDATE user_xp SET level = ? WHERE user_id = ? AND persona_id = ?', [newLevel, userId, personaId]);
    current.level = newLevel;
  }

  const previousXp = current.xp - amount;
  const leveledUp = newLevel > calculateLevel(previousXp);

  if (reason) {
    await pool.execute(
      'INSERT INTO user_xp_log (user_id, persona_id, amount, reason, created_at) VALUES (?, ?, ?, ?, NOW())',
      [userId, personaId, amount, reason]
    );
  }

  if (leveledUp) {
    try {
      const events = require('../events');
      await events.emit('on_level_up', { userId, personaId, newLevel, previousLevel: current.level || 1, xp: newXp });
    } catch {}
  }

  const milestones = [100, 500, 1000, 5000, 10000];
  for (const milestone of milestones) {
    if (current.xp < milestone && newXp >= milestone) {
      try {
        const events = require('../events');
        await events.emit('on_xp_milestone', { userId, personaId, milestone, xp: newXp });
      } catch {}
    }
  }

  return { xp: newXp, level: newLevel, leveledUp, previousLevel: current.level || 1, streak: current.streak || 0 };
}

async function updateStreak(userId, personaId) {
  const current = await getXp(userId, personaId);
  const lastActivity = current.last_activity;
  const today = new Date().toISOString().slice(0, 10);

  if (!lastActivity) {
    await pool.execute(
      'UPDATE user_xp SET streak = 1, best_streak = GREATEST(best_streak, 1), last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
      [userId, personaId]
    );
    return { streak: 1, bestStreak: Math.max(current.best_streak || 0, 1), streakBroken: false };
  }

  const lastDate = new Date(lastActivity).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (lastDate === today) {
    return { streak: current.streak || 0, bestStreak: current.best_streak || 0, streakBroken: false };
  }

  if (lastDate === yesterday) {
    const newStreak = (current.streak || 0) + 1;
    const newBest = Math.max(current.best_streak || 0, newStreak);
    await pool.execute(
      'UPDATE user_xp SET streak = ?, best_streak = ?, last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
      [newStreak, newBest, userId, personaId]
    );
    return { streak: newStreak, bestStreak: newBest, streakBroken: false };
  }

  await pool.execute(
    'UPDATE user_xp SET streak = 1, best_streak = GREATEST(best_streak, 1), last_activity = NOW() WHERE user_id = ? AND persona_id = ?',
    [userId, personaId]
  );
  return { streak: 1, bestStreak: current.best_streak || 0, streakBroken: true };
}

async function addBadge(userId, personaId, badgeId, badgeName) {
  const current = await getXp(userId, personaId);
  let badges = current.badges || [];
  if (badges.some(b => b.id === badgeId)) return current;

  badges.push({ id: badgeId, name: badgeName, earnedAt: new Date().toISOString() });
  await pool.execute(
    'UPDATE user_xp SET badges = ? WHERE user_id = ? AND persona_id = ?',
    [JSON.stringify(badges), userId, personaId]
  );
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
  const badgeRules = [
    { id: 'first_message', name: 'Primeira Mensagem', condition: () => true },
    { id: 'streak_3', name: 'Sequência de 3', condition: () => (xp.streak || 0) >= 3 },
    { id: 'streak_7', name: 'Sequência de 7', condition: () => (xp.streak || 0) >= 7 },
    { id: 'streak_30', name: 'Sequência de 30', condition: () => (xp.streak || 0) >= 30 },
    { id: 'level_5', name: 'Nível 5', condition: () => (xp.level || 1) >= 5 },
    { id: 'level_10', name: 'Nível 10', condition: () => (xp.level || 1) >= 10 },
    { id: 'xp_100', name: '100 XP', condition: () => (xp.xp || 0) >= 100 },
    { id: 'xp_500', name: '500 XP', condition: () => (xp.xp || 0) >= 500 },
    { id: 'xp_1000', name: '1000 XP', condition: () => (xp.xp || 0) >= 1000 },
    { id: 'xp_5000', name: '5000 XP', condition: () => (xp.xp || 0) >= 5000 },
  ];

  for (const rule of badgeRules) {
    if (rule.condition() && !xp.badges.some(b => b.id === rule.id)) {
      await addBadge(userId, personaId, rule.id, rule.name);
      awarded.push({ id: rule.id, name: rule.name });
      try {
        const events = require('../events');
        await events.emit('on_badge_earned', { userId, personaId, badgeId: rule.id, badgeName: rule.name });
      } catch {}
    }
  }
  return awarded;
}

function calculateLevel(xp) {
  const thresholds = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300, 19200, 21200, 23300, 25500, 27800, 30200, 32700, 35300, 38000, 40800];
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (xp >= thresholds[i]) return i + 1;
  }
  return 1;
}

function getXpForNextLevel(currentXp) {
  const thresholds = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800, 8000, 9300, 10700, 12200, 13800, 15500, 17300, 19200, 21200, 23300, 25500, 27800, 30200, 32700, 35300, 38000, 40800];
  const level = calculateLevel(currentXp);
  if (level >= thresholds.length) return { needed: Infinity, remaining: Infinity };
  const nextThreshold = thresholds[level];
  return { needed: nextThreshold, remaining: nextThreshold - currentXp };
}

function formatXpContext(xpData) {
  if (!xpData) return '';
  const level = xpData.level || 1;
  const xp = xpData.xp || 0;
  const streak = xpData.streak || 0;
  const nextLevel = getXpForNextLevel(xp);
  const badges = (xpData.badges || []).map(b => b.name).join(', ');
  return `GAMIFICATION: Level ${level}, ${xp} XP${nextLevel.remaining > 0 ? `, ${nextLevel.remaining} XP to next level` : ''}, Streak: ${streak} days${badges ? `, Badges: ${badges}` : ''}`;
}

module.exports = {
  getXp, addXp, updateStreak, addBadge, removeBadge,
  getLeaderboard, getXpLog, checkAndAwardBadges,
  calculateLevel, getXpForNextLevel, formatXpContext,
};