/**
 * Rate Limit module tests
 */

const { mockPool, mockExecute, resetMocks } = require('../../helpers/mockDb');
const { setMockSettings, resetSettings } = require('../../helpers/mockSettings');

const { checkRateLimit, checkBan, getUserRole } = require('../../../src/auth/rateLimit');

beforeEach(() => {
  resetMocks();
  resetSettings();
  setMockSettings({
    rate_limit_guest: '5',
    rate_limit_user: '30',
    rate_limit_premium: '100',
    rate_limit_admin: '999',
  });
});

describe('Rate Limit - getUserRole', () => {
  test('returns role from DB', async () => {
    mockExecute.mockResolvedValueOnce([[{ role: 'premium' }], []]);
    const role = await getUserRole('user_1');
    expect(role).toBe('premium');
  });

  test('returns guest when user not found', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const role = await getUserRole('nonexistent');
    expect(role).toBe('guest');
  });

  test('returns user on DB error', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB down'));
    const role = await getUserRole('user_1');
    expect(role).toBe('user');
  });
});

describe('Rate Limit - checkRateLimit', () => {
  test('admin always allowed with Infinity remaining', async () => {
    const result = await checkRateLimit('admin_1', 'admin');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(Infinity);
    // Should not hit DB at all
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('allows user under limit', async () => {
    // INSERT/UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // SELECT count
    mockExecute.mockResolvedValueOnce([[{ request_count: 5, window_start: new Date() }], []]);

    const result = await checkRateLimit('user_1', 'user');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(25); // 30 - 5
    expect(result.limit).toBe(30);
  });

  test('blocks user at limit', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ request_count: 30, window_start: new Date() }], []]);

    const result = await checkRateLimit('user_1', 'user');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test('blocks guest at 5 messages', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ request_count: 5, window_start: new Date() }], []]);

    const result = await checkRateLimit('guest_1', 'guest');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(5);
  });

  test('premium gets 100 messages', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ request_count: 50, window_start: new Date() }], []]);

    const result = await checkRateLimit('premium_1', 'premium');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(50); // 100 - 50
    expect(result.limit).toBe(100);
  });

  test('returns allowed when no row found (first request)', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await checkRateLimit('new_user', 'user');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(30);
  });

  test('uses custom limit from settings', async () => {
    setMockSettings({ rate_limit_user: '10' });
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ request_count: 10, window_start: new Date() }], []]);

    const result = await checkRateLimit('user_1', 'user');
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
  });

  test('resetIn is positive number', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ request_count: 30, window_start: new Date() }], []]);

    const result = await checkRateLimit('user_1', 'user');
    expect(result.resetIn).toBeGreaterThan(0);
  });
});

describe('Rate Limit - checkBan', () => {
  test('returns true for banned user', async () => {
    mockExecute.mockResolvedValueOnce([[{ role: 'banned' }], []]);
    const banned = await checkBan('bad_user');
    expect(banned).toBe(true);
  });

  test('returns false for normal user', async () => {
    mockExecute.mockResolvedValueOnce([[{ role: 'user' }], []]);
    const banned = await checkBan('good_user');
    expect(banned).toBe(false);
  });

  test('returns false for admin', async () => {
    mockExecute.mockResolvedValueOnce([[{ role: 'admin' }], []]);
    const banned = await checkBan('admin_1');
    expect(banned).toBe(false);
  });
});
