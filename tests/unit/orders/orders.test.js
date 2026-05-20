/**
 * Orders module tests — create, status transitions, cancel
 */

const { mockPool, mockExecute, mockConnection, mockGetConnection, resetMocks } = require('../../helpers/mockDb');
const { setMockSettings, resetSettings } = require('../../helpers/mockSettings');

// Mock products module
jest.mock('../../../src/erp/products', () => ({
  getProduct: jest.fn(),
  adjustStock: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock events
jest.mock('../../../src/events', () => ({
  emit: jest.fn(),
}));

const orders = require('../../../src/erp/orders');

beforeEach(() => {
  resetMocks();
  resetSettings();
});

describe('Orders - Status Transitions', () => {
  const baseOrder = {
    id: 'ord_1',
    order_number: 'ORD-260520-0001',
    status: 'pending',
    payment_status: 'pending',
    fulfillment_status: 'unfulfilled',
    total: 100,
    subtotal: 100,
    discount: 0,
    shipping: 0,
    tax: 0,
    customer_phone: null,
    owner_id: null,
    shipping_address: null,
    billing_address: null,
    metadata: null,
    items: [],
  };

  test('allows pending → confirmed', async () => {
    // getOrder
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]); // items
    mockExecute.mockResolvedValueOnce([[], []]); // deliveries
    // UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // getOrder after update
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, status: 'confirmed', shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await orders.updateOrderStatus('ord_1', 'confirmed');
    expect(result.status).toBe('confirmed');
  });

  test('allows pending → cancelled', async () => {
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    // UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // getOrder after
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, status: 'cancelled', shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await orders.updateOrderStatus('ord_1', 'cancelled');
    expect(result.status).toBe('cancelled');
  });

  test('rejects cancelled → shipped (no transitions from cancelled)', async () => {
    const cancelledOrder = { ...baseOrder, status: 'cancelled', shipping_address: null, billing_address: null, metadata: null };
    mockExecute.mockResolvedValueOnce([[cancelledOrder], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(orders.updateOrderStatus('ord_1', 'shipped'))
      .rejects.toThrow('Cannot transition from cancelled to shipped');
  });

  test('rejects pending → shipped (must go through confirmed/paid/processing)', async () => {
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(orders.updateOrderStatus('ord_1', 'shipped'))
      .rejects.toThrow('Cannot transition');
  });

  test('rejects pending → delivered (skip steps)', async () => {
    mockExecute.mockResolvedValueOnce([[{ ...baseOrder, shipping_address: null, billing_address: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(orders.updateOrderStatus('ord_1', 'delivered'))
      .rejects.toThrow('Cannot transition');
  });

  test('allows shipped → delivered', async () => {
    const shippedOrder = { ...baseOrder, status: 'shipped', shipping_address: null, billing_address: null, metadata: null };
    mockExecute.mockResolvedValueOnce([[shippedOrder], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([[{ ...shippedOrder, status: 'delivered' }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await orders.updateOrderStatus('ord_1', 'delivered');
    expect(result.status).toBe('delivered');
  });

  test('throws when order not found', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(orders.updateOrderStatus('nonexistent', 'confirmed'))
      .rejects.toThrow('Order not found');
  });
});

describe('Orders - Create Order', () => {
  test('creates order with transaction', async () => {
    // generateOrderNumber: getConnection + beginTransaction + SELECT FOR UPDATE + commit + release
    mockConnection.execute.mockResolvedValueOnce([[{ cnt: 0 }], []]); // COUNT for order number
    // createOrder: getConnection
    mockConnection.execute
      .mockResolvedValueOnce([[{ cnt: 0 }], []]) // generateOrderNumber SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // INSERT order
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]); // INSERT order_item

    // getOrder after commit
    mockExecute.mockResolvedValueOnce([[{
      id: 'ord_test', order_number: 'ORD-260520-0001', status: 'pending',
      payment_status: 'pending', fulfillment_status: 'unfulfilled',
      total: 25, subtotal: 25, discount: 0, shipping: 0, tax: 0,
      customer_name: 'Test', customer_phone: null, shipping_address: null,
      billing_address: null, metadata: null, owner_id: null,
    }], []]);
    mockExecute.mockResolvedValueOnce([[], []]); // items
    mockExecute.mockResolvedValueOnce([[], []]); // deliveries

    const result = await orders.createOrder({
      customer_name: 'Test',
      items: [{ product_id: 'p1', title: 'Burger', unit_price: 25, quantity: 1, type: 'physical' }],
      deduct_stock: false,
    });

    expect(result).not.toBeNull();
    expect(mockConnection.beginTransaction).toHaveBeenCalled();
    expect(mockConnection.commit).toHaveBeenCalled();
  });

  test('rolls back on error', async () => {
    mockConnection.execute.mockResolvedValueOnce([[{ cnt: 0 }], []]); // order number
    mockConnection.execute.mockRejectedValueOnce(new Error('DB error')); // INSERT fails

    await expect(orders.createOrder({
      customer_name: 'Test',
      items: [{ product_id: 'p1', title: 'Burger', unit_price: 25, quantity: 1 }],
      deduct_stock: false,
    })).rejects.toThrow('DB error');

    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalled();
  });
});

describe('Orders - Cancel Order (stock restore)', () => {
  test('cancelOrder restores stock for physical items', async () => {
    const { adjustStock } = require('../../../src/erp/products');
    const orderWithItems = {
      id: 'ord_1', order_number: 'ORD-001', status: 'confirmed',
      shipping_address: null, billing_address: null, metadata: null,
      customer_phone: null, owner_id: 'owner_1', total: 50,
    };
    const items = [
      { product_id: 'p1', variant_id: null, title: 'Burger', quantity: 2, type: 'physical' },
      { product_id: null, variant_id: null, title: 'Frete', quantity: 1, type: 'shipping' },
    ];

    // getOrder
    mockExecute.mockResolvedValueOnce([[orderWithItems], []]);
    mockExecute.mockResolvedValueOnce([items.map(i => ({ ...i, unit_price: 25, discount: 0, total: 25 })), []]);
    mockExecute.mockResolvedValueOnce([[], []]); // deliveries
    // adjustStock for physical item (not shipping)
    // UPDATE status
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // getOrder after
    mockExecute.mockResolvedValueOnce([[{ ...orderWithItems, status: 'cancelled' }], []]);
    mockExecute.mockResolvedValueOnce([items.map(i => ({ ...i, unit_price: 25, discount: 0, total: 25 })), []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    await orders.cancelOrder('ord_1', 'Customer request');
    // adjustStock should be called for physical item only
    expect(adjustStock).toHaveBeenCalledWith('p1', null, 'return', 2, expect.any(String), 'ord_1', 'owner_1');
  });
});

describe('Orders - getOrder', () => {
  test('returns null for non-existent order', async () => {
    mockExecute.mockResolvedValueOnce([[], []]);
    const result = await orders.getOrder('nonexistent');
    expect(result).toBeNull();
  });

  test('returns order with items and deliveries', async () => {
    mockExecute.mockResolvedValueOnce([[{
      id: 'ord_1', order_number: 'ORD-001', status: 'pending',
      total: 50, subtotal: 50, discount: 0, shipping: 0, tax: 0,
      shipping_address: null, billing_address: null, metadata: null,
    }], []]);
    mockExecute.mockResolvedValueOnce([[{ id: 'oit_1', product_id: 'p1', title: 'Item', quantity: 1, unit_price: 50, total: 50, specs: null, metadata: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await orders.getOrder('ord_1');
    expect(result.id).toBe('ord_1');
    expect(result.items).toHaveLength(1);
    expect(result.deliveries).toHaveLength(0);
  });
});
