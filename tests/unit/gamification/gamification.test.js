/**
 * Gamification module tests — XP, levels, streaks, badges
 */

const { mockPool, mockExecute, resetMocks } = require('../../helpers/mockDb');
const { setMockSettings, resetSettings } = require('../../helpers/mockSettings');

// Mock events
jest.mock('../../../src/events', () => ({
  emit: jest.fn().mockResolvedValue(undefined),
}));

const gamification = require('../../../src/gamification');

beforeEach(() => {
  resetMocks();
  resetSettings();
  setMockSettings({
    xp_per_message: '2',
    xp_per_goal: '25',
    xp_per_badge: '10',
    streak_grace_days: '1',
  });
});

describe('Gamification - calculateLevel', () => {
  test('level 1 at 0 XP', () => {
    expect(gamification.calculateLevel(0)).toBe(1);
  });

  test('level 1 at 49 XP', () => {
    expect(gamification.calculateLevel(49)).toBe(1);
  });

  test('level 2 at 50 XP', () => {
    expect(gamification.calculateLevel(50)).toBe(2);
  });

  test('level 3 at 150 XP', () => {
    expect(gamification.calculateLevel(150)).toBe(3);
  });

  test('level 4 at 300 XP', () => {
    expect(gamification.calculateLevel(300)).toBe(4);
  });

  test('level 5 at 500 XP', () => {
    expect(gamification.calculateLevel(500)).toBe(5);
  });

  test('level 6 at 800 XP', () => {
    expect(gamification.calculateLevel(800)).toBe(6);
  });

  test('handles very high XP', () => {
    const level = gamification.calculateLevel(200000);
    expect(level).toBeGreaterThan(30);
  });
});

describe('Gamification - getXpForNextLevel', () => {
  test('returns correct XP needed for level 2', () => {
    const result = gamification.getXpForNextLevel(0);
    expect(result.needed).toBe(50);
    expect(result.remaining).toBe(50);
  });

  test('returns remaining XP when partially through level', () => {
    const result = gamification.getXpForNextLevel(30);
    expect(result.needed).toBe(50);
    expect(result.remaining).toBe(20);
  });

  test('returns correct for level 3 threshold', () => {
    const result = gamification.getXpForNextLevel(100);
    expect(result.needed).toBe(150);
    expect(result.remaining).toBe(50);
  });
});

describe('Gamification - getXp', () => {
  test('returns default values for new user', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const xp = await gamification.getXp('new_user', 'persona_1');
    expect(xp.xp).toBe(0);
    expect(xp.level).toBe(1);
    expect(xp.streak).toBe(0);
    expect(xp.badges).toEqual([]);
  });

  test('returns parsed data for existing user', async () => {
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'user_1', persona_id: 'p1', xp: 250, level: 3,
      streak: 5, best_streak: 10, last_activity: new Date(),
      badges: JSON.stringify([{ id: 'first_message', name: 'First', earnedAt: '2024-01-01' }]),
      total_messages: 50, goals_completed: 2,
    }], []]);
    const xp = await gamification.getXp('user_1', 'p1');
    expect(xp.xp).toBe(250);
    expect(xp.level).toBe(3);
    expect(xp.streak).toBe(5);
    expect(xp.badges).toHaveLength(1);
    expect(xp.badges[0].id).toBe('first_message');
  });

  test('handles malformed badges JSON', async () => {
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'user_1', persona_id: 'p1', xp: 100, level: 2,
      streak: 0, best_streak: 0, last_activity: null,
      badges: 'invalid json{{{',
      total_messages: 0, goals_completed: 0,
    }], []]);
    const xp = await gamification.getXp('user_1', 'p1');
    expect(xp.badges).toEqual([]);
  });
});

describe('Gamification - addXp', () => {
  test('adds XP with streak multiplier', async () => {
    // getXp (previous)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 40, level: 1,
      streak: 4, best_streak: 4, last_activity: new Date(),
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    // INSERT/UPDATE xp
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // getXp (current)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 42, level: 1,
      streak: 4, best_streak: 4, last_activity: new Date(),
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    // INSERT xp_log
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.addXp('u1', 'p1', 2, 'message');
    // streak=4 → multiplier = 1 + min(4*0.05, 0.5) = 1.2 → 2*1.2 = 2.4 → round = 2
    expect(result.xpGained).toBe(2);
    expect(result.streakMultiplier).toBe(1.2);
  });

  test('streak bonus does not get multiplied', async () => {
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 100, level: 2,
      streak: 10, best_streak: 10, last_activity: new Date(),
      badges: '[]', total_messages: 20, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 105, level: 2,
      streak: 10, best_streak: 10, last_activity: new Date(),
      badges: '[]', total_messages: 20, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.addXp('u1', 'p1', 5, 'streak_bonus');
    expect(result.xpGained).toBe(5); // Not multiplied
  });

  test('detects level up', async () => {
    // Previous: 45 XP (level 1)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 45, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[]', total_messages: 5, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // After: 55 XP (level 2)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 55, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[]', total_messages: 5, goals_completed: 0,
    }], []]);
    // UPDATE level
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // Level up bonus log
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // Level up bonus XP update
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // XP log
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.addXp('u1', 'p1', 10, 'message');
    expect(result.leveledUp).toBe(true);
    expect(result.level).toBe(2);
    expect(result.previousLevel).toBe(1);
  });
});

describe('Gamification - updateStreak', () => {
  test('starts streak at 1 for first activity', async () => {
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 0, level: 1,
      streak: 0, best_streak: 0, last_activity: null,
      badges: '[]', total_messages: 0, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.updateStreak('u1', 'p1');
    expect(result.streak).toBe(1);
    expect(result.streakBroken).toBe(false);
  });

  test('same day activity does not change streak', async () => {
    const today = new Date();
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 50, level: 2,
      streak: 3, best_streak: 5, last_activity: today,
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);

    const result = await gamification.updateStreak('u1', 'p1');
    expect(result.streak).toBe(3);
    expect(result.streakBroken).toBe(false);
  });

  test('consecutive day increments streak', async () => {
    const yesterday = new Date(Date.now() - 86400000);
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 50, level: 2,
      streak: 3, best_streak: 5, last_activity: yesterday,
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    // UPDATE streak
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // addXp for streak bonus (getXp)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 50, level: 2,
      streak: 4, best_streak: 5, last_activity: new Date(),
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 59, level: 2,
      streak: 4, best_streak: 5, last_activity: new Date(),
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.updateStreak('u1', 'p1');
    expect(result.streak).toBe(4);
    expect(result.streakBroken).toBe(false);
    expect(result.bonus).toBeGreaterThan(0);
  });

  test('breaks streak after gap beyond grace period', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 50, level: 2,
      streak: 10, best_streak: 15, last_activity: threeDaysAgo,
      badges: '[]', total_messages: 10, goals_completed: 0,
    }], []]);
    // UPDATE reset streak
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.updateStreak('u1', 'p1');
    expect(result.streak).toBe(1);
    expect(result.streakBroken).toBe(true);
    expect(result.previousStreak).toBe(10);
  });
});

describe('Gamification - formatXpContext', () => {
  test('formats XP context string', () => {
    const xpData = { xp: 250, level: 3, streak: 5, best_streak: 10, badges: [{ id: 'first_message', name: 'First', icon: '💬' }] };
    const ctx = gamification.formatXpContext(xpData);
    expect(ctx).toContain('250');
    expect(ctx).toContain('3');
    expect(ctx).toContain('5');
  });

  test('returns empty for null data', () => {
    const ctx = gamification.formatXpContext(null);
    expect(ctx).toBe('');
  });
});

describe('Gamification - checkAndAwardBadges', () => {
  test('awards first_message badge when total_messages >= 1', async () => {
    // getXp
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 10, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[]', total_messages: 1, goals_completed: 0,
    }], []]);
    // addBadge → getXp
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 10, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[]', total_messages: 1, goals_completed: 0,
    }], []]);
    // UPDATE badges
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // addXp for badge (getXp)
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 10, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[{"id":"first_message"}]', total_messages: 1, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 20, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: '[{"id":"first_message"}]', total_messages: 1, goals_completed: 0,
    }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await gamification.checkAndAwardBadges('u1', 'p1');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('does not re-award existing badge', async () => {
    mockExecute.mockResolvedValueOnce([[{
      user_id: 'u1', persona_id: 'p1', xp: 10, level: 1,
      streak: 0, best_streak: 0, last_activity: new Date(),
      badges: JSON.stringify([{ id: 'first_message', name: 'First', earnedAt: '2024-01-01' }]),
      total_messages: 1, goals_completed: 0,
    }], []]);

    const result = await gamification.checkAndAwardBadges('u1', 'p1');
    // first_message already exists, no new badges for this state
    expect(result).toEqual([]);
  });
});
