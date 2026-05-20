const { pool } = require('../db');
const { getProduct, adjustStock } = require('./products');

function generateId(prefix = 'ord') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function generateOrderNumber() {
  const [rows] = await pool.execute('SELECT COUNT(*) as cnt FROM orders WHERE created_at >= CURDATE()');
  const count = rows[0].cnt + 1;
  const date = new Date();
  const prefix = String(date.getFullYear()).slice(-2) + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  return `ORD-${prefix}-${String(count).padStart(4, '0')}`;
}

const ORDER_STATUSES = ['pending', 'confirmed', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'expired'];
const PAYMENT_STATUSES = ['pending', 'paid', 'partial', 'refunded', 'failed', 'expired'];
const FULFILLMENT_STATUSES = ['unfulfilled', 'partial', 'fulfilled', 'returned'];
const NEXT_STATUS = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['paid', 'cancelled'],
  paid: ['processing', 'refunded', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  refunded: [],
  expired: [],
};
const PAYMENT_NEXT = {
  pending: ['paid', 'failed', 'expired'],
  paid: ['refunded'],
  partial: ['paid', 'refunded'],
  failed: ['pending'],
  refunded: [],
  expired: [],
};

async function createOrder(data) {
  const id = generateId('ord');
  const orderNumber = data.order_number || await generateOrderNumber();
  const shippingAddress = data.shipping_address ? JSON.stringify(data.shipping_address) : null;
  const billingAddress = data.billing_address ? JSON.stringify(data.billing_address) : null;
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  let subtotal = 0;
  const items = data.items || [];
  for (const item of items) {
    subtotal += (item.unit_price || 0) * (item.quantity || 1);
  }
  const discount = data.discount || 0;
  const shipping = data.shipping || 0;
  const tax = data.tax || 0;
  const total = subtotal - discount + shipping + tax;

  await pool.execute(
    `INSERT INTO orders (id, order_number, customer_id, customer_name, customer_email, customer_phone,
     customer_document, status, payment_status, fulfillment_status, source, subtotal, discount, shipping,
     tax, total, currency, coupon_code, notes, internal_notes, shipping_address, billing_address,
     payment_method, payment_reference, metadata, persona_id, owner_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, orderNumber, data.customer_id || null, data.customer_name || null, data.customer_email || null,
    data.customer_phone || null, data.customer_document || null,
    data.status || 'pending', data.payment_status || 'pending', data.fulfillment_status || 'unfulfilled',
    data.source || 'web', subtotal, discount, shipping, tax, total,
    data.currency || 'BRL', data.coupon_code || null, data.notes || null, data.internal_notes || null,
    shippingAddress, billingAddress,
    data.payment_method || null, data.payment_reference || null, metadata,
    data.persona_id || null, data.owner_id || null,
    ]
  );

  for (const item of items) {
    await createOrderItem(id, item);
  }

  if (data.deduct_stock !== false) {
    for (const item of items) {
      if (item.type !== 'shipping' && item.type !== 'discount' && item.type !== 'fee') {
        await adjustStock(item.product_id, item.variant_id, 'out', item.quantity, `Order ${orderNumber}`, id, data.owner_id);
      }
    }
  }

  const order = await getOrder(id);
  const { emit } = require('../events');
  emit('order_created', { orderId: id, orderNumber, customerId: data.customer_id, total, items: items.length });
  if (data.contact_phone) {
    await createNotification({
      type: 'order_created',
      channel: 'whatsapp',
      recipient_id: data.customer_id,
      recipient_phone: data.contact_phone || data.customer_phone,
      message: `✅ Pedido *#${orderNumber}* confirmado!\n\n${items.map(i => `• ${i.title || i.name} x${i.quantity} — R$ ${(i.unit_price * i.quantity).toFixed(2)}`).join('\n')}\n\n💰 Total: R$ ${total.toFixed(2)}\n\nAcompanhe seu pedido por aqui!`,
      related_id: id,
      related_type: 'order',
    });
  }
  return order;
}

async function createOrderItem(orderId, data) {
  const id = data.id || generateId('oit');
  const specs = data.specs ? JSON.stringify(data.specs) : null;
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  const total = (data.unit_price || 0) * (data.quantity || 1) - (data.discount || 0);

  await pool.execute(
    `INSERT INTO order_items (id, order_id, product_id, variant_id, title, subtitle, type, quantity,
     unit_price, unit_cost, discount, total, image, specs, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, orderId, data.product_id || null, data.variant_id || null, data.title || data.name || 'Item',
    data.subtitle || null, data.type || 'physical', data.quantity || 1,
    data.unit_price || 0, data.unit_cost || 0, data.discount || 0, total,
    data.image || null, specs, metadata]
  );
  return { id, orderId, total };
}

async function getOrder(orderId) {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (rows.length === 0) return null;
  const order = deserializeOrder(rows[0]);
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at', [orderId]);
  order.items = items.map(deserializeOrderItem);
  const [deliveries] = await pool.execute('SELECT * FROM deliveries WHERE order_id = ?', [orderId]);
  order.deliveries = deliveries.map(deserializeDelivery);
  return order;
}

async function getOrderByNumber(orderNumber) {
  const [rows] = await pool.execute('SELECT id FROM orders WHERE order_number = ?', [orderNumber]);
  if (rows.length === 0) return null;
  return getOrder(rows[0].id);
}

async function listOrders(filters = {}) {
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  if (filters.payment_status) { query += ' AND payment_status = ?'; params.push(filters.payment_status); }
  if (filters.fulfillment_status) { query += ' AND fulfillment_status = ?'; params.push(filters.fulfillment_status); }
  if (filters.customer_id) { query += ' AND customer_id = ?'; params.push(filters.customer_id); }
  if (filters.source) { query += ' AND source = ?'; params.push(filters.source); }
  if (filters.owner_id) { query += ' AND owner_id = ?'; params.push(filters.owner_id); }
  if (filters.search) { query += ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  if (filters.date_from) { query += ' AND created_at >= ?'; params.push(filters.date_from); }
  if (filters.date_to) { query += ' AND created_at <= ?'; params.push(filters.date_to); }

  query += ' ORDER BY created_at DESC';
  const limit = Math.min(parseInt(filters.limit) || 50, 200);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeOrder);
}

async function updateOrderStatus(orderId, status, extraUpdates = {}) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order not found');

  const allowed = NEXT_STATUS[order.status] || [];
  if (!allowed.includes(status) && status !== order.status) {
    throw new Error(`Cannot transition from ${order.status} to ${status}. Allowed: ${allowed.join(', ')}`);
  }

  const updates = { status, ...extraUpdates };
  const setClauses = [];
  const values = [];

  if (updates.status) { setClauses.push('status = ?'); values.push(updates.status); }
  if (updates.payment_status) { setClauses.push('payment_status = ?'); values.push(updates.payment_status); }
  if (updates.fulfillment_status) { setClauses.push('fulfillment_status = ?'); values.push(updates.fulfillment_status); }
  if (updates.internal_notes) { setClauses.push('internal_notes = ?'); values.push(updates.internal_notes); }
  if (updates.tracking_code) { setClauses.push('tracking_code = ?'); values.push(updates.tracking_code); }
  if (updates.metadata) { setClauses.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

  const nowClause = status === 'paid' ? ', paid_at = NOW()' : status === 'shipped' ? ', shipped_at = NOW()' : status === 'delivered' ? ', delivered_at = NOW()' : status === 'cancelled' ? ', cancelled_at = NOW()' : '';

  if (status === 'cancelled' || status === 'expired') {
    for (const item of order.items) {
      if (item.type !== 'shipping' && item.type !== 'discount' && item.type !== 'fee') {
        await adjustStock(item.product_id, item.variant_id, 'return', item.quantity, `Order ${order.order_number} ${status}`, orderId, order.owner_id);
      }
    }
  }

  values.push(orderId);
  await pool.execute(`UPDATE orders SET ${setClauses.join(', ')}${nowClause} WHERE id = ?`, values);

  const updated = await getOrder(orderId);
  const { emit } = require('../events');
  emit(`order_${status}`, { orderId, orderNumber: order.order_number, status, total: order.total });

  if (order.customer_phone) {
    const phoneMessages = {
      paid: `💰 Pedido *#${order.order_number}* — Pagamento confirmado! Seu pedido está sendo preparado.`,
      shipped: `📦 Pedido *#${order.order_number}* — Enviado! Rastreio: ${extraUpdates.tracking_code || 'em breve'}`,
      delivered: `✅ Pedido *#${order.order_number}* — Entregue! Obrigado pela preferência.`,
      cancelled: `❌ Pedido *#${order.order_number}* — Cancelado. Estoque restaurado.`,
    };
    if (phoneMessages[status]) {
      await createNotification({ type: `order_${status}`, channel: 'whatsapp', recipient_id: order.customer_id, recipient_phone: order.customer_phone, message: phoneMessages[status], related_id: orderId, related_type: 'order' });
    }
  }
  return updated;
}

async function payOrder(orderId, paymentData = {}) {
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order not found');
  if (order.payment_status === 'paid') throw new Error('Order already paid');

  const updates = { payment_status: 'paid', status: 'paid' };
  if (paymentData.payment_method) updates.payment_method = paymentData.payment_method;
  if (paymentData.payment_reference) updates.payment_reference = paymentData.payment_reference;

  return updateOrderStatus(orderId, 'paid', updates);
}

async function cancelOrder(orderId, reason) {
  return updateOrderStatus(orderId, 'cancelled', { internal_notes: reason || 'Cancelled' });
}

async function getOrderStats(filters = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (filters.owner_id) { where += ' AND owner_id = ?'; params.push(filters.owner_id); }
  if (filters.date_from) { where += ' AND created_at >= ?'; params.push(filters.date_from); }
  if (filters.date_to) { where += ' AND created_at <= ?'; params.push(filters.date_to); }

  const [statusRows] = await pool.execute(`SELECT status, COUNT(*) as count, SUM(total) as revenue FROM orders ${where} GROUP BY status`, params);
  const [totalRows] = await pool.execute(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as total_revenue, COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) as paid_revenue, COALESCE(AVG(total), 0) as avg_ticket FROM orders ${where}`, params);

  const [pending] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE payment_status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 3 DAY) ${filters.owner_id ? 'AND owner_id = ?' : ''}`, filters.owner_id ? [filters.owner_id] : []);
  const [overdue] = await pool.execute(`SELECT COUNT(*) as count FROM orders WHERE payment_status = 'pending' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) ${filters.owner_id ? 'AND owner_id = ?' : ''}`, filters.owner_id ? [filters.owner_id] : []);

  return {
    total: totalRows[0].total_orders,
    revenue: parseFloat(totalRows[0].total_revenue),
    paid_revenue: parseFloat(totalRows[0].paid_revenue),
    avg_ticket: parseFloat(totalRows[0].avg_ticket),
    by_status: statusRows.reduce((acc, r) => { acc[r.status] = { count: r.count, revenue: parseFloat(r.revenue || 0) }; return acc; }, {}),
    pending_overdue: pending[0].count,
    days_overdue_7: overdue[0].count,
  };
}

async function createDelivery(orderId, data) {
  const id = generateId('del');
  const address = data.shipping_address ? JSON.stringify(data.shipping_address) : null;
  const dimensions = data.dimensions ? JSON.stringify(data.dimensions) : null;
  const trackingEvents = data.tracking_events ? JSON.stringify(data.tracking_events) : null;
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;

  await pool.execute(
    `INSERT INTO deliveries (id, order_id, tracking_code, carrier, carrier_service, status,
     estimated_delivery, shipping_address, weight, dimensions, cost, tracking_url, tracking_events, notes, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, orderId, data.tracking_code || null, data.carrier || null, data.carrier_service || null,
    data.status || 'pending', data.estimated_delivery || null, address, data.weight || null, dimensions,
    data.cost || 0, data.tracking_url || null, trackingEvents, data.notes || null, metadata]
  );
  return { id, orderId };
}

async function createNotification(data) {
  const id = generateId('notif');
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  await pool.execute(
    `INSERT INTO notifications (id, type, channel, recipient_id, recipient_name, recipient_phone, recipient_email, message, title, status, related_id, related_type, scheduled_at, metadata, owner_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.type, data.channel || 'whatsapp', data.recipient_id || null, data.recipient_name || null,
    data.recipient_phone || null, data.recipient_email || null, data.message || null, data.title || null,
    data.status || 'pending', data.related_id || null, data.related_type || null,
    data.scheduled_at || null, metadata, data.owner_id || null]
  );
  return { id };
}

async function getOverdueOrders(days = 3) {
  const [rows] = await pool.execute(
    'SELECT * FROM orders WHERE payment_status = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY) AND status NOT IN (?, ?) ORDER BY created_at ASC',
    ['pending', days, 'cancelled', 'expired']
  );
  return rows.map(deserializeOrder);
}

function deserializeOrder(row) {
  return {
    ...row,
    subtotal: parseFloat(row.subtotal),
    discount: parseFloat(row.discount),
    shipping: parseFloat(row.shipping),
    tax: parseFloat(row.tax),
    total: parseFloat(row.total),
    shipping_address: typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : (row.shipping_address || null),
    billing_address: typeof row.billing_address === 'string' ? JSON.parse(row.billing_address) : (row.billing_address || null),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
  };
}

function deserializeOrderItem(row) {
  return {
    ...row,
    unit_price: parseFloat(row.unit_price),
    unit_cost: parseFloat(row.unit_cost || 0),
    discount: parseFloat(row.discount || 0),
    total: parseFloat(row.total),
    specs: typeof row.specs === 'string' ? JSON.parse(row.specs) : (row.specs || {}),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
  };
}

function deserializeDelivery(row) {
  return {
    ...row,
    cost: parseFloat(row.cost),
    shipping_address: typeof row.shipping_address === 'string' ? JSON.parse(row.shipping_address) : (row.shipping_address || null),
    dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : (row.dimensions || null),
    tracking_events: typeof row.tracking_events === 'string' ? JSON.parse(row.tracking_events) : (row.tracking_events || []),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
  };
}

function formatOrderForWhatsApp(order) {
  const statusEmoji = { pending: '⏳', confirmed: '✅', paid: '💰', processing: '🔨', shipped: '📦', delivered: '✅', cancelled: '❌', refunded: '↩️', expired: '⌛' };
  const items = (order.items || []).map(i => `  • ${i.title}${i.quantity > 1 ? ` x${i.quantity}` : ''} — R$ ${i.total.toFixed(2)}`).join('\n');
  return `${statusEmoji[order.status] || '📋'} *Pedido #${order.order_number}*\n${items}\n\n💰 Total: R$ ${order.total.toFixed(2)}\n📊 Status: ${order.status}${order.payment_status !== order.status ? ` | Pagamento: ${order.payment_status}` : ''}`;
}

module.exports = {
  createOrder, getOrder, getOrderByNumber, listOrders, updateOrderStatus, payOrder, cancelOrder,
  createOrderItem, createDelivery, getOrderStats, getOverdueOrders,
  createNotification, formatOrderForWhatsApp,
  ORDER_STATUSES, PAYMENT_STATUSES, FULFILLMENT_STATUSES, NEXT_STATUS, PAYMENT_NEXT,
};