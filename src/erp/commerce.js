const { pool } = require('../db');
const erpProducts = require('./products');
const erpOrders = require('./orders');
const { getSetting } = require('../settings');

const CART_TTL_MS = 30 * 60 * 1000; // 30 min
const ORDER_FLOW_TIMEOUT_MS = 20 * 60 * 1000; // 20 min

const FLOW_STEPS = [
  'browsing',
  'building_order',
  'confirming_address',
  'confirming_payment',
  'confirming_order',
  'completed',
];

const PAYMENT_METHODS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cash: 'Dinheiro',
  cartao: 'Cartão',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  other: 'Outro',
};

function mapPaymentMethod(method) {
  if (!method) return null;
  const map = { dinheiro: 'cash', pix: 'pix', cartao: 'credit_card', cartao_credito: 'credit_card', cartao_debito: 'debit_card', transferencia: 'bank_transfer', boleto: 'boleto', cash: 'cash', credit_card: 'credit_card', debit_card: 'debit_card', bank_transfer: 'bank_transfer' };
  return map[method.toLowerCase()] || method;
}

async function getCart(sessionId) {
  const [rows] = await pool.execute(
    'SELECT * FROM commerce_carts WHERE session_id = ? AND status = ? ORDER BY updated_at DESC LIMIT 1',
    [sessionId, 'active']
  );
  if (rows.length === 0) return null;
  const cart = rows[0];
  cart.items = typeof cart.items === 'string' ? JSON.parse(cart.items) : (cart.items || []);
  cart.shipping_address = typeof cart.shipping_address === 'string' ? JSON.parse(cart.shipping_address) : (cart.shipping_address || null);
  cart.metadata = typeof cart.metadata === 'string' ? JSON.parse(cart.metadata) : (cart.metadata || {});
  return cart;
}

async function createCart(sessionId, userId, personaId) {
  const id = 'cart_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  await pool.execute(
    'INSERT INTO commerce_carts (id, session_id, user_id, persona_id, items, status, flow_step, metadata, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())',
    [id, sessionId, userId || null, personaId || null, JSON.stringify([]), 'active', 'browsing', JSON.stringify({})]
  );
  return getCart(sessionId);
}

async function updateCart(sessionId, updates) {
  const cart = await getCart(sessionId);
  if (!cart) return null;
  const sets = [];
  const vals = [];
  for (const [key, val] of Object.entries(updates)) {
    if (key === 'items' || key === 'shipping_address' || key === 'metadata') {
      sets.push(`${key} = ?`);
      vals.push(JSON.stringify(val));
    } else {
      sets.push(`${key} = ?`);
      vals.push(val);
    }
  }
  sets.push('updated_at = NOW()');
  vals.push(sessionId);
  await pool.execute(`UPDATE commerce_carts SET ${sets.join(', ')} WHERE session_id = ? AND status = 'active'`, vals);
  return getCart(sessionId);
}

async function addCartItem(sessionId, product) {
  let cart = await getCart(sessionId);
  if (!cart) return null;
  const items = [...cart.items];
  const existing = items.find(i => i.product_id === product.product_id && (product.variant_id ? i.variant_id === product.variant_id : !i.variant_id));
  if (existing) {
    existing.quantity += product.quantity || 1;
    existing.total = existing.unit_price * existing.quantity;
  } else {
    items.push({
      product_id: product.product_id,
      variant_id: product.variant_id || null,
      title: product.title || product.name,
      unit_price: product.unit_price || product.price || 0,
      quantity: product.quantity || 1,
      total: (product.unit_price || product.price || 0) * (product.quantity || 1),
      image: product.image || null,
      type: product.type || 'physical',
    });
  }
  return updateCart(sessionId, { items });
}

async function removeCartItem(sessionId, productId, variantId) {
  let cart = await getCart(sessionId);
  if (!cart) return null;
  const items = cart.items.filter(i => !(i.product_id === productId && (variantId ? i.variant_id === variantId : !i.variant_id)));
  return updateCart(sessionId, { items });
}

async function clearCart(sessionId) {
  return updateCart(sessionId, { items: [], flow_step: 'browsing', shipping_address: null, metadata: {} });
}

async function getOrCreateCart(sessionId, userId, personaId) {
  let cart = await getCart(sessionId);
  if (!cart) {
    cart = await createCart(sessionId, userId, personaId);
  }
  // check timeout
  if (cart.updated_at && new Date(cart.updated_at).getTime() < Date.now() - CART_TTL_MS) {
    await pool.execute("UPDATE commerce_carts SET status = 'expired' WHERE id = ?", [cart.id]);
    cart = await createCart(sessionId, userId, personaId);
  }
  return cart;
}

async function setFlowStep(sessionId, step) {
  return updateCart(sessionId, { flow_step: step });
}

function getCartSummary(cart) {
  if (!cart || !cart.items || cart.items.length === 0) {
    return { items: [], subtotal: 0, shipping: 0, discount: 0, total: 0, itemCount: 0 };
  }
  const items = cart.items || [];
  const subtotal = items.reduce((sum, i) => sum + (i.total || i.unit_price * i.quantity), 0);
  const shipping = cart.metadata?.shipping_fee || 0;
  const discount = cart.metadata?.discount || 0;
  const total = subtotal + shipping - discount;
  return {
    items: items.map(i => ({
      title: i.title,
      quantity: i.quantity,
      unit_price: i.unit_price,
      total: i.total || i.unit_price * i.quantity,
    })),
    subtotal,
    shipping,
    discount,
    total,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
  };
}

function formatCartForWhatsApp(cart) {
  const summary = getCartSummary(cart);
  if (summary.itemCount === 0) return '🛒 Seu carrinho está vazio';
  const lines = summary.items.map(i => `• ${i.title} x${i.quantity} — R$ ${i.total.toFixed(2)}`);
  let text = `🛒 *Seu pedido:*\n\n${lines.join('\n')}`;
  text += `\n\nSubtotal: R$ ${summary.subtotal.toFixed(2)}`;
  if (summary.shipping > 0) text += `\nFrete: R$ ${summary.shipping.toFixed(2)}`;
  if (summary.discount > 0) text += `\nDesconto: -R$ ${summary.discount.toFixed(2)}`;
  text += `\n*Total: R$ ${summary.total.toFixed(2)}*`;
  const changeFor = cart.metadata?.change_for;
  if (changeFor) text += `\nTroco para: R$ ${changeFor.toFixed(2)}`;
  return text;
}

async function calculateDeliveryFee(addressText) {
  const deliveryFee = parseFloat(await getSetting('store_delivery_fee')) || 0;
  const freeAbove = parseFloat(await getSetting('store_free_delivery_above')) || 0;
  const deliveryZonesRaw = await getSetting('store_delivery_zones');
  let zones = [];
  try { zones = deliveryZonesRaw ? JSON.parse(deliveryZonesRaw) : []; } catch { zones = []; }

  let fee = deliveryFee;
  let estimatedMinutes = '35-45';
  let matchedZone = null;

  if (zones.length > 0 && addressText) {
    const addr = addressText.toLowerCase();
    for (const zone of zones) {
      const keywords = (zone.keywords || []).map(k => k.toLowerCase());
      if (keywords.some(k => addr.includes(k))) {
        matchedZone = zone;
        fee = zone.fee || 0;
        estimatedMinutes = zone.estimated_minutes || estimatedMinutes;
        break;
      }
    }
  }

  return { fee, estimatedMinutes, freeAbove, matchedZone };
}

async function finalizeOrder(sessionId, source = 'whatsapp') {
  const cart = await getCart(sessionId);
  if (!cart || cart.items.length === 0) {
    return { error: 'Carrinho vazio. Não é possível finalizar o pedido.' };
  }

  const summary = getCartSummary(cart);
  const meta = cart.metadata || {};
  const shippingAddress = cart.shipping_address || {};

  const orderData = {
    customer_name: meta.customer_name || meta.name || '',
    customer_phone: meta.customer_phone || meta.phone || '',
    customer_email: meta.customer_email || meta.email || null,
    items: cart.items.map(i => ({
      product_id: i.product_id,
      variant_id: i.variant_id || null,
      title: i.title,
      quantity: i.quantity,
      unit_price: i.unit_price,
      type: i.type || 'physical',
    })),
    shipping: summary.shipping,
    discount: summary.discount,
    shipping_address: shippingAddress,
    payment_method: mapPaymentMethod(meta.payment_method) || null,
    notes: meta.notes || meta.obs || null,
    source,
    deduct_stock: true,
  };

  if (meta.change_for) {
    orderData.metadata = { change_for: meta.change_for };
  }

  try {
    const order = await erpOrders.createOrder(orderData);

    // Mark cart as completed
    await pool.execute("UPDATE commerce_carts SET status = 'completed', flow_step = 'completed', order_id = ? WHERE id = ?", [order.id, cart.id]);

    return {
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      total: order.total,
      formatted: erpOrders.formatOrderForWhatsApp(order),
    };
  } catch (err) {
    return { error: `Erro ao criar pedido: ${err.message}` };
  }
}

async function getOrderHistory(userId, phone) {
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (userId) {
    query += ' AND customer_id = ?';
    params.push(userId);
  }
  if (phone) {
    query += ' AND customer_phone LIKE ?';
    params.push(`%${phone}%`);
  }
  query += ' ORDER BY created_at DESC LIMIT 10';
  const [rows] = await pool.execute(query, params);
  return rows.map(erpOrders.formatOrderForWhatsApp ? r => ({
    id: r.id,
    order_number: r.order_number,
    status: r.status,
    total: parseFloat(r.total),
    created_at: r.created_at,
  }) : r);
}

async function searchProducts(query, category) {
  const products = await erpProducts.listProducts({
    search: query,
    category: category || undefined,
    is_active: true,
  });
  return products.filter(p => !p.track_stock || p.stock > 0).slice(0, 10).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    compare_at_price: p.compare_at_price,
    stock: p.track_stock ? p.stock : null,
    category: p.category,
    brand: p.brand,
    image: p.featured_image || (p.images && p.images[0]) || null,
    description: p.description ? (typeof p.description === 'string' ? p.description.substring(0, 200) : '') : '',
    variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })),
  }));
}

async function getProductDetail(productId) {
  const p = await erpProducts.getProduct(productId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    compare_at_price: p.compare_at_price,
    stock: p.track_stock ? p.stock : null,
    track_stock: p.track_stock,
    category: p.category,
    brand: p.brand,
    type: p.type,
    weight: p.weight,
    images: p.images,
    featured_image: p.featured_image,
    tags: p.tags,
    is_featured: p.is_featured,
    variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, price: v.price, stock: v.stock, sku: v.sku })),
  };
}

async function getCategoryTree() {
  return erpProducts.getCategoryTree();
}

async function validateCoupon(code) {
  const [rows] = await pool.execute(
    'SELECT * FROM coupon_codes WHERE code = ? AND is_active = 1',
    [code.toUpperCase()]
  );
  if (rows.length === 0) return { valid: false, error: 'Cupom inválido ou expirado.' };
  const coupon = rows[0];
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, error: 'Cupom expirado.' };
  }
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'Cupom esgotado.' };
  }
  return {
    valid: true,
    code: coupon.code,
    type: coupon.type,
    value: parseFloat(coupon.value),
    min_value: parseFloat(coupon.min_value || 0),
    max_uses: coupon.max_uses,
    used_count: coupon.used_count,
    description: coupon.description,
  };
}

async function applyCoupon(sessionId, code, cartTotal) {
  const coupon = await validateCoupon(code);
  if (!coupon.valid) return coupon;
  let discount = 0;
  if (coupon.type === 'percentage') {
    discount = cartTotal * (coupon.value / 100);
  } else {
    discount = coupon.value;
  }
  if (coupon.min_value > 0 && cartTotal < coupon.min_value) {
    return { valid: false, error: `Pedido mínimo de R$ ${coupon.min_value.toFixed(2)} para usar este cupom.` };
  }
  await updateCart(sessionId, {
    metadata: { coupon_code: coupon.code, discount, coupon_type: coupon.type, coupon_value: coupon.value },
  });
  return { valid: true, discount, code: coupon.code, type: coupon.type, value: coupon.value };
}

async function cleanupExpiredCarts() {
  const [result] = await pool.execute(
    "UPDATE commerce_carts SET status = 'expired' WHERE status = 'active' AND updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE)"
  );
  return result.affectedRows;
}

module.exports = {
  getCart,
  createCart,
  updateCart,
  addCartItem,
  removeCartItem,
  clearCart,
  getOrCreateCart,
  setFlowStep,
  getCartSummary,
  formatCartForWhatsApp,
  calculateDeliveryFee,
  finalizeOrder,
  getOrderHistory,
  searchProducts,
  getProductDetail,
  getCategoryTree,
  validateCoupon,
  applyCoupon,
  cleanupExpiredCarts,
  PAYMENT_METHODS,
  FLOW_STEPS,
};