/**
 * Loyalty module tests — earn, redeem, expire, balance
 */

const { mockPool, mockExecute, resetMocks } = require('../../helpers/mockDb');
const { setMockSettings, resetSettings } = require('../../helpers/mockSettings');

// Mock gamification before requiring loyalty
jest.mock('../../../src/gamification', () => ({
  addXp: jest.fn(),
  getXp: jest.fn(),
}));

const loyalty = require('../../../src/loyalty');

beforeEach(() => {
  resetMocks();
  resetSettings();
  setMockSettings({
    loyalty_type: 'points',
    loyalty_points_per_real: '1',
    loyalty_cashback_percent: '5',
    loyalty_minimum_redemption: '100',
  });
});

describe('Loyalty - getLoyaltyProgram', () => {
  test('returns persona-specific program', async () => {
    const program = { id: 'lp_1', persona_id: 'store', type: 'points', points_per_real: 2, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[program], []]);
    const result = await loyalty.getLoyaltyProgram('store');
    expect(result.type).toBe('points');
    expect(result.points_per_real).toBe(2);
  });

  test('falls back to global program', async () => {
    mockExecute.mockResolvedValueOnce([[], []]); // no persona-specific
    const global = { id: 'lp_global', persona_id: null, type: 'cashback', cashback_percent: 5, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[global], []]);
    const result = await loyalty.getLoyaltyProgram('store');
    expect(result.type).toBe('cashback');
  });

  test('returns null when no program exists', async () => {
    mockExecute.mockResolvedValueOnce([[], []]); // no persona
    mockExecute.mockResolvedValueOnce([[], []]); // no global
    const result = await loyalty.getLoyaltyProgram('store');
    expect(result).toBeNull();
  });
});

describe('Loyalty - getLoyaltyBalance', () => {
  test('returns zero balance when no program', async () => {
    mockExecute.mockResolvedValueOnce([[], []]); // no persona program
    mockExecute.mockResolvedValueOnce([[], []]); // no global program
    const balance = await loyalty.getLoyaltyBalance('user_1', 'store');
    expect(balance.points).toBe(0);
    expect(balance.cashback).toBe(0);
    expect(balance.program).toBeNull();
  });

  test('calculates points balance (earned - spent)', async () => {
    const program = { id: 'lp_1', persona_id: 'store', type: 'points', points_per_real: 1, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[program], []]); // getLoyaltyProgram
    mockExecute.mockResolvedValueOnce([[{ earned: 500, spent: 100, cashback_earned: 0, cashback_spent: 0 }], []]); // balance query
    const balance = await loyalty.getLoyaltyBalance('user_1', 'store');
    expect(balance.points).toBe(400);
  });

  test('calculates cashback balance', async () => {
    const program = { id: 'lp_1', persona_id: 'store', type: 'cashback', cashback_percent: 5, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[program], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 0, spent: 0, cashback_earned: 25.50, cashback_spent: 10 }], []]);
    const balance = await loyalty.getLoyaltyBalance('user_1', 'store');
    expect(balance.cashback).toBe('15.50');
  });
});

describe('Loyalty - earnPoints', () => {
  const program = { id: 'lp_1', persona_id: 'store', type: 'points', points_per_real: 2, cashback_percent: 5, redemption_threshold: 100, is_active: 1 };

  test('earns points based on amount × points_per_real', async () => {
    // getOrCreateLoyaltyProgram → getLoyaltyProgram
    mockExecute.mockResolvedValueOnce([[program], []]);
    // idempotency check
    mockExecute.mockResolvedValueOnce([[], []]);
    // INSERT transaction
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.earnPoints('user_1', 'store', 'ord_1', 50, 'Pedido');
    expect(result.points_earned).toBe(100); // 50 × 2
  });

  test('prevents duplicate points for same order (idempotency)', async () => {
    mockExecute.mockResolvedValueOnce([[program], []]);
    // idempotency check returns existing
    mockExecute.mockResolvedValueOnce([[{ id: 'lt_existing' }], []]);

    const result = await loyalty.earnPoints('user_1', 'store', 'ord_1', 50, 'Pedido');
    expect(result.already_awarded).toBe(true);
    expect(result.id).toBe('lt_existing');
  });

  test('earns cashback for cashback program', async () => {
    const cashbackProgram = { ...program, type: 'cashback' };
    mockExecute.mockResolvedValueOnce([[cashbackProgram], []]);
    mockExecute.mockResolvedValueOnce([[], []]); // no duplicate
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.earnPoints('user_1', 'store', 'ord_2', 100, 'Pedido');
    expect(result.cashback_earned).toBe(5); // 100 × 5%
  });

  test('earns 1 stamp for stamp_card program', async () => {
    const stampProgram = { ...program, type: 'stamp_card' };
    mockExecute.mockResolvedValueOnce([[stampProgram], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.earnPoints('user_1', 'store', 'ord_3', 200, 'Pedido');
    expect(result.stamps_earned).toBe(1);
  });

  test('allows earning without orderId (manual award)', async () => {
    mockExecute.mockResolvedValueOnce([[program], []]);
    // No idempotency check when orderId is null/undefined
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.earnPoints('user_1', 'store', null, 10, 'Bonus');
    expect(result.points_earned).toBe(20); // 10 × 2
  });
});

describe('Loyalty - redeemPoints', () => {
  const program = { id: 'lp_1', persona_id: 'store', type: 'points', points_per_real: 1, cashback_percent: 5, redemption_threshold: 10, is_active: 1 };

  test('redeems points successfully', async () => {
    // getLoyaltyBalance → getLoyaltyProgram
    mockExecute.mockResolvedValueOnce([[program], []]);
    // balance query
    mockExecute.mockResolvedValueOnce([[{ earned: 500, spent: 100, cashback_earned: 0, cashback_spent: 0 }], []]);
    // getReward (null rewardId)
    // INSERT redeem transaction
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.redeemPoints('user_1', 'store', 200, null);
    expect(result.points_redeemed).toBe(200);
    expect(result.remaining).toBe(200); // 400 - 200
  });

  test('rejects when insufficient points', async () => {
    mockExecute.mockResolvedValueOnce([[program], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 50, spent: 0, cashback_earned: 0, cashback_spent: 0 }], []]);

    const result = await loyalty.redeemPoints('user_1', 'store', 100, null);
    expect(result.error).toContain('insuficientes');
  });

  test('redeems cashback successfully', async () => {
    const cashbackProgram = { ...program, type: 'cashback' };
    mockExecute.mockResolvedValueOnce([[cashbackProgram], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 0, spent: 0, cashback_earned: 50, cashback_spent: 10 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.redeemPoints('user_1', 'store', 20, null);
    expect(result.cashback_redeemed).toBe(20);
    expect(result.remaining).toBe(20); // 40 - 20
  });

  test('rejects cashback when insufficient', async () => {
    const cashbackProgram = { ...program, type: 'cashback' };
    mockExecute.mockResolvedValueOnce([[cashbackProgram], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 0, spent: 0, cashback_earned: 10, cashback_spent: 5 }], []]);

    const result = await loyalty.redeemPoints('user_1', 'store', 20, null);
    expect(result.error).toContain('insuficiente');
  });

  test('redeems stamp_card at threshold', async () => {
    const stampProgram = { ...program, type: 'stamp_card', redemption_threshold: 10 };
    mockExecute.mockResolvedValueOnce([[stampProgram], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 12, spent: 0, cashback_earned: 0, cashback_spent: 0 }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await loyalty.redeemPoints('user_1', 'store', null, null);
    expect(result.stamps_redeemed).toBe(10);
    expect(result.remaining).toBe(2);
  });

  test('rejects stamp_card below threshold', async () => {
    const stampProgram = { ...program, type: 'stamp_card', redemption_threshold: 10 };
    mockExecute.mockResolvedValueOnce([[stampProgram], []]);
    mockExecute.mockResolvedValueOnce([[{ earned: 7, spent: 0, cashback_earned: 0, cashback_spent: 0 }], []]);

    const result = await loyalty.redeemPoints('user_1', 'store', null, null);
    expect(result.error).toContain('carimbos');
  });

  test('returns error when no program exists', async () => {
    mockExecute.mockResolvedValueOnce([[], []]); // no persona
    mockExecute.mockResolvedValueOnce([[], []]); // no global
    mockExecute.mockResolvedValueOnce([[{ earned: 0, spent: 0, cashback_earned: 0, cashback_spent: 0 }], []]);

    const result = await loyalty.redeemPoints('user_1', 'store', 100, null);
    expect(result.error).toContain('não encontrado');
  });
});

describe('Loyalty - formatLoyaltyContext', () => {
  test('formats points context', () => {
    const balance = { points: 250, cashback: 0, program: { type: 'points', points_per_real: 2, redemption_threshold: 100 } };
    const ctx = loyalty.formatLoyaltyContext(balance);
    expect(ctx).toContain('250 pontos');
    expect(ctx).toContain('R$1 gasto = 2 pontos');
  });

  test('formats cashback context', () => {
    const balance = { points: 0, cashback: '15.50', program: { type: 'cashback', cashback_percent: 5 } };
    const ctx = loyalty.formatLoyaltyContext(balance);
    expect(ctx).toContain('R$15.50');
    expect(ctx).toContain('5%');
  });

  test('formats stamp_card context', () => {
    const balance = { points: 7, cashback: 0, program: { type: 'stamp_card', redemption_threshold: 10 } };
    const ctx = loyalty.formatLoyaltyContext(balance);
    expect(ctx).toContain('7 carimbos');
    expect(ctx).toContain('10 carimbos');
  });

  test('returns empty string when no program', () => {
    const ctx = loyalty.formatLoyaltyContext({ points: 0, cashback: 0, program: null });
    expect(ctx).toBe('');
  });

  test('returns empty string for null balance', () => {
    const ctx = loyalty.formatLoyaltyContext(null);
    expect(ctx).toBe('');
  });
});
