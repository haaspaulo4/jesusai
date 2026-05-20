/**
 * Commerce module tests — cart operations, delivery fee, coupon, finalize
 */

const { mockPool, mockExecute, mockConnection, resetMocks } = require('../../helpers/mockDb');
const { setMockSettings, resetSettings } = require('../../helpers/mockSettings');

// Mock products module (used by stock validation in addCartItem)
jest.mock('../../../src/erp/products', () => ({
  getProduct: jest.fn().mockResolvedValue(null), // No stock tracking by default
  searchProducts: jest.fn().mockResolvedValue([]),
  adjustStock: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock orders module
jest.mock('../../../src/erp/orders', () => ({
  createOrder: jest.fn().mockResolvedValue({ id: 'ord_test', order_number: 'ORD-001' }),
}));

const commerce = require('../../../src/erp/commerce');

beforeEach(() => {
  resetMocks();
  resetSettings();
  setMockSettings({
    store_delivery_fee: '5',
    store_free_delivery_above: '90',
    store_delivery_zones: JSON.stringify([
      { name: 'Centro', keywords: ['centro', 'praca'], fee: 0, estimated_minutes: '20-30' },
      { name: 'Bairro', keywords: ['jardim', 'vila'], fee: 5, estimated_minutes: '30-40' },
      { name: 'Rural', keywords: ['rural', 'rodovia'], fee: 7, estimated_minutes: '35-45' },
    ]),
  });
});

describe('Commerce - Cart Operations', () => {
  const mockCart = {
    id: 'cart_test1',
    session_id: 'sess_1',
    user_id: 'user_1',
    persona_id: 'persona_1',
    items: JSON.stringify([]),
    status: 'active',
    flow_step: 'browsing',
    metadata: JSON.stringify({}),
    shipping_address: null,
    updated_at: new Date(),
  };

  test('getCart returns null when no active cart', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const cart = await commerce.getCart('sess_nonexistent');
    expect(cart).toBeNull();
  });

  test('getCart parses JSON fields correctly', async () => {
    const cartWithItems = {
      ...mockCart,
      items: JSON.stringify([{ product_id: 'p1', title: 'Pizza', unit_price: 30, quantity: 2, total: 60 }]),
      metadata: JSON.stringify({ customer_name: 'João' }),
    };
    mockExecute.mockResolvedValueOnce([[cartWithItems], []]);
    const cart = await commerce.getCart('sess_1');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].title).toBe('Pizza');
    expect(cart.metadata.customer_name).toBe('João');
  });

  test('addCartItem adds new item to cart', async () => {
    // getCart call
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    // updateCart: getCart
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    // updateCart: UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // updateCart: getCart after update
    const updatedCart = { ...mockCart, items: JSON.stringify([{ product_id: 'p1', title: 'Burger', unit_price: 25, quantity: 1, total: 25 }]), metadata: '{}' };
    mockExecute.mockResolvedValueOnce([[updatedCart], []]);

    const result = await commerce.addCartItem('sess_1', {
      product_id: 'p1',
      title: 'Burger',
      unit_price: 25,
      quantity: 1,
    });
    expect(result).not.toBeNull();
  });

  test('addCartItem increments quantity for existing item', async () => {
    const existingItems = [{ product_id: 'p1', variant_id: null, title: 'Burger', unit_price: 25, quantity: 1, total: 25 }];
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify(existingItems), metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify(existingItems), metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const updated = { ...mockCart, items: JSON.stringify([{ ...existingItems[0], quantity: 2, total: 50 }]), metadata: '{}' };
    mockExecute.mockResolvedValueOnce([[updated], []]);

    const result = await commerce.addCartItem('sess_1', {
      product_id: 'p1',
      title: 'Burger',
      unit_price: 25,
      quantity: 1,
    });
    expect(result).not.toBeNull();
  });

  test('removeCartItem filters out the specified product', async () => {
    const items = [
      { product_id: 'p1', variant_id: null, title: 'Burger', unit_price: 25, quantity: 1, total: 25 },
      { product_id: 'p2', variant_id: null, title: 'Fries', unit_price: 10, quantity: 1, total: 10 },
    ];
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify(items), metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify(items), metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify([items[1]]), metadata: '{}' }], []]);

    const result = await commerce.removeCartItem('sess_1', 'p1', null);
    expect(result).not.toBeNull();
  });

  test('clearCart resets items and flow_step', async () => {
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', flow_step: 'browsing', metadata: '{}' }], []]);

    const result = await commerce.clearCart('sess_1');
    expect(result).not.toBeNull();
  });

  test('addCartItem rejects when stock is insufficient', async () => {
    const { getProduct } = require('../../../src/erp/products');
    getProduct.mockResolvedValueOnce({ id: 'p1', name: 'Burger', stock: 2, track_stock: true });

    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: JSON.stringify([{ product_id: 'p1', variant_id: null, title: 'Burger', unit_price: 25, quantity: 2, total: 50 }]), metadata: '{}' }], []]);

    const result = await commerce.addCartItem('sess_1', {
      product_id: 'p1',
      title: 'Burger',
      unit_price: 25,
      quantity: 1,
    });
    expect(result.error).toContain('Estoque insuficiente');
  });

  test('addCartItem allows when stock is sufficient', async () => {
    const { getProduct } = require('../../../src/erp/products');
    getProduct.mockResolvedValueOnce({ id: 'p1', name: 'Burger', stock: 10, track_stock: true });

    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const updated = { ...mockCart, items: JSON.stringify([{ product_id: 'p1', title: 'Burger', unit_price: 25, quantity: 1, total: 25 }]), metadata: '{}' };
    mockExecute.mockResolvedValueOnce([[updated], []]);

    const result = await commerce.addCartItem('sess_1', {
      product_id: 'p1',
      title: 'Burger',
      unit_price: 25,
      quantity: 1,
    });
    expect(result).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  test('addCartItem skips stock check when product has no track_stock', async () => {
    const { getProduct } = require('../../../src/erp/products');
    getProduct.mockResolvedValueOnce({ id: 'p1', name: 'Burger', stock: 0, track_stock: false });

    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([[{ ...mockCart, items: '[]', metadata: '{}' }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const updated = { ...mockCart, items: JSON.stringify([{ product_id: 'p1', title: 'Burger', unit_price: 25, quantity: 1, total: 25 }]), metadata: '{}' };
    mockExecute.mockResolvedValueOnce([[updated], []]);

    const result = await commerce.addCartItem('sess_1', {
      product_id: 'p1',
      title: 'Burger',
      unit_price: 25,
      quantity: 1,
    });
    expect(result).not.toBeNull();
    expect(result.error).toBeUndefined();
  });
});

describe('Commerce - Cart Summary', () => {
  test('getCartSummary returns zeros for empty cart', () => {
    const summary = commerce.getCartSummary({ items: [], metadata: {} });
    expect(summary.subtotal).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.itemCount).toBe(0);
  });

  test('getCartSummary calculates correctly with items', () => {
    const cart = {
      items: [
        { title: 'Burger', unit_price: 25, quantity: 2, total: 50 },
        { title: 'Fries', unit_price: 10, quantity: 1, total: 10 },
      ],
      metadata: { shipping_fee: 5, discount: 3 },
    };
    const summary = commerce.getCartSummary(cart);
    expect(summary.subtotal).toBe(60);
    expect(summary.shipping).toBe(5);
    expect(summary.discount).toBe(3);
    expect(summary.total).toBe(62); // 60 + 5 - 3
    expect(summary.itemCount).toBe(3);
  });

  test('getCartSummary handles null cart', () => {
    const summary = commerce.getCartSummary(null);
    expect(summary.total).toBe(0);
  });
});

describe('Commerce - Delivery Fee', () => {
  test('calculateDeliveryFee matches Centro zone (free)', async () => {
    const result = await commerce.calculateDeliveryFee('Rua do Centro, 123');
    expect(result.fee).toBe(0);
    expect(result.matchedZone.name).toBe('Centro');
  });

  test('calculateDeliveryFee matches Bairro zone', async () => {
    const result = await commerce.calculateDeliveryFee('Rua Jardim das Flores');
    expect(result.fee).toBe(5);
    expect(result.matchedZone.name).toBe('Bairro');
  });

  test('calculateDeliveryFee matches Rural zone', async () => {
    const result = await commerce.calculateDeliveryFee('Rodovia BR-101 km 5');
    expect(result.fee).toBe(7);
    expect(result.matchedZone.name).toBe('Rural');
  });

  test('calculateDeliveryFee returns default fee when no zone matches', async () => {
    const result = await commerce.calculateDeliveryFee('Endereço desconhecido');
    expect(result.fee).toBe(5); // store_delivery_fee default
    expect(result.matchedZone).toBeNull();
  });

  test('calculateDeliveryFee handles null address', async () => {
    const result = await commerce.calculateDeliveryFee(null);
    expect(result.fee).toBe(5);
    expect(result.matchedZone).toBeNull();
  });

  test('calculateDeliveryFee is case-insensitive', async () => {
    const result = await commerce.calculateDeliveryFee('RUA DO CENTRO');
    expect(result.fee).toBe(0);
    expect(result.matchedZone.name).toBe('Centro');
  });
});

describe('Commerce - Payment Method Mapping', () => {
  test('maps dinheiro to cash', () => {
    expect(commerce.PAYMENT_METHODS.dinheiro).toBe('Dinheiro');
    expect(commerce.PAYMENT_METHODS.cash).toBe('Dinheiro');
  });

  test('maps pix correctly', () => {
    expect(commerce.PAYMENT_METHODS.pix).toBe('PIX');
  });

  test('maps cartao variants', () => {
    expect(commerce.PAYMENT_METHODS.cartao).toBe('Cartão');
    expect(commerce.PAYMENT_METHODS.cartao_credito).toBe('Cartão de Crédito');
    expect(commerce.PAYMENT_METHODS.cartao_debito).toBe('Cartão de Débito');
  });
});

describe('Commerce - Coupon Validation', () => {
  test('validateCoupon returns invalid for non-existent code', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const result = await commerce.validateCoupon('FAKE');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('inválido');
  });

  test('validateCoupon returns invalid for expired coupon', async () => {
    const expired = { code: 'OLD', type: 'percentage', value: 10, expires_at: '2020-01-01', max_uses: 100, used_count: 0, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[expired], []]);
    const result = await commerce.validateCoupon('OLD');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expirado');
  });

  test('validateCoupon returns invalid for exhausted coupon', async () => {
    const exhausted = { code: 'FULL', type: 'percentage', value: 10, expires_at: '2030-01-01', max_uses: 5, used_count: 5, is_active: 1 };
    mockExecute.mockResolvedValueOnce([[exhausted], []]);
    const result = await commerce.validateCoupon('FULL');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('esgotado');
  });

  test('validateCoupon returns valid for good coupon', async () => {
    const good = { code: 'SAVE10', type: 'percentage', value: 10, expires_at: '2030-01-01', max_uses: 100, used_count: 3, is_active: 1, min_value: 0 };
    mockExecute.mockResolvedValueOnce([[good], []]);
    const result = await commerce.validateCoupon('SAVE10');
    expect(result.valid).toBe(true);
    expect(result.value).toBe(10);
    expect(result.type).toBe('percentage');
  });
});

describe('Commerce - Apply Coupon', () => {
  test('applyCoupon calculates percentage discount', async () => {
    const coupon = { code: 'SAVE10', type: 'percentage', value: 10, expires_at: '2030-01-01', max_uses: 100, used_count: 3, is_active: 1, min_value: 0 };
    // validateCoupon query
    mockExecute.mockResolvedValueOnce([[coupon], []]);
    // UPDATE coupon_codes used_count
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // getCart for metadata merge
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: JSON.stringify({ customer_name: 'Test' }), status: 'active', shipping_address: null, updated_at: new Date() }], []]);
    // updateCart getCart
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);
    // updateCart UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // updateCart getCart after
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);

    const result = await commerce.applyCoupon('s1', 'SAVE10', 100);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(10); // 10% of 100
  });

  test('applyCoupon calculates fixed discount', async () => {
    const coupon = { code: 'FLAT5', type: 'fixed', value: 5, expires_at: '2030-01-01', max_uses: 100, used_count: 0, is_active: 1, min_value: 0 };
    mockExecute.mockResolvedValueOnce([[coupon], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);

    const result = await commerce.applyCoupon('s1', 'FLAT5', 50);
    expect(result.valid).toBe(true);
    expect(result.discount).toBe(5);
  });

  test('applyCoupon rejects when below min_value', async () => {
    const coupon = { code: 'MIN50', type: 'percentage', value: 10, expires_at: '2030-01-01', max_uses: 100, used_count: 0, is_active: 1, min_value: 50 };
    mockExecute.mockResolvedValueOnce([[coupon], []]);

    const result = await commerce.applyCoupon('s1', 'MIN50', 30);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('mínimo');
  });

  test('applyCoupon rejects when coupon exhausted (affectedRows=0)', async () => {
    const coupon = { code: 'LAST', type: 'percentage', value: 10, expires_at: '2030-01-01', max_uses: 5, used_count: 4, is_active: 1, min_value: 0 };
    mockExecute.mockResolvedValueOnce([[coupon], []]);
    // UPDATE returns 0 affected (race condition — someone else used the last one)
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    const result = await commerce.applyCoupon('s1', 'LAST', 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('esgotado');
  });
});

describe('Commerce - Format Cart for WhatsApp', () => {
  test('formats empty cart', () => {
    const text = commerce.formatCartForWhatsApp({ items: [], metadata: {} });
    expect(text).toContain('vazio');
  });

  test('formats cart with items', () => {
    const cart = {
      items: [
        { title: 'Burger', unit_price: 25, quantity: 2, total: 50 },
        { title: 'Coke', unit_price: 8, quantity: 1, total: 8 },
      ],
      metadata: { shipping_fee: 5 },
    };
    const text = commerce.formatCartForWhatsApp(cart);
    expect(text).toContain('Burger');
    expect(text).toContain('Coke');
    expect(text).toContain('63.00'); // 58 + 5
  });

  test('formats cart with string change_for without crashing', () => {
    const cart = {
      items: [{ title: 'Pizza', unit_price: 40, quantity: 1, total: 40 }],
      metadata: { change_for: '50' },
    };
    const text = commerce.formatCartForWhatsApp(cart);
    expect(text).toContain('Troco para: R$ 50.00');
  });

  test('formats cart with numeric change_for', () => {
    const cart = {
      items: [{ title: 'Pizza', unit_price: 40, quantity: 1, total: 40 }],
      metadata: { change_for: 100 },
    };
    const text = commerce.formatCartForWhatsApp(cart);
    expect(text).toContain('Troco para: R$ 100.00');
  });
});

describe('Commerce - Finalize Order', () => {
  test('finalizeOrder returns error for empty cart', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 'cart1', session_id: 's1', items: '[]', metadata: '{}', status: 'active', shipping_address: null, updated_at: new Date() }], []]);
    const result = await commerce.finalizeOrder('s1');
    expect(result.error).toContain('vazio');
  });

  test('finalizeOrder returns error when no cart exists', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const result = await commerce.finalizeOrder('s1');
    expect(result.error).toContain('vazio');
  });
});
