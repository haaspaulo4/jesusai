const express = require('express');
const { authMiddleware } = require('../auth');
const { pool } = require('../db');
const erp = require('../erp');

const router = express.Router();

function adminMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function paginated(req, maxLimit = 100) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), maxLimit);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

// ==================== PRODUCTS ====================

router.get('/products', authMiddleware, async (req, res) => {
  try {
    const { type, category, search, is_active, is_featured, owner_id } = req.query;
    const products = await erp.products.listProducts({ type, category, search, is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined, is_featured: is_featured === 'true' ? true : undefined, owner_id: req.userRole === 'admin' ? owner_id : req.userId });
    res.json({ products, total: products.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/stats', authMiddleware, async (req, res) => {
  try { res.json(await erp.products.getProductStats()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/categories', authMiddleware, async (req, res) => {
  try { res.json(await erp.products.getCategoryTree()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/products/categories', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.products.createCategory(req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/:id', authMiddleware, async (req, res) => {
  try { const p = await erp.products.getProduct(req.params.id); if (!p) return res.status(404).json({ error: 'Product not found' }); res.json(p); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/products', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.products.createProduct({ ...req.body, owner_id: req.body.owner_id && req.userRole === 'admin' ? req.body.owner_id : req.userId })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.products.updateProduct(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.products.deleteProduct(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/products/:id/stock', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { type, quantity, reason, variant_id } = req.body;
    res.json(await erp.products.adjustStock(req.params.id, variant_id, type, quantity, reason, null, req.userId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/products/:id/variants', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.products.createVariant(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/products/low-stock', authMiddleware, async (req, res) => {
  try { res.json(await erp.products.getLowStockProducts(parseInt(req.query.threshold) || undefined)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== ORDERS ====================

router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const { status, payment_status, customer_id, source, search, date_from, date_to, owner_id } = req.query;
    const { limit, offset } = paginated(req);
    const orders = await erp.orders.listOrders({ status, payment_status, customer_id, source, search, date_from, date_to, owner_id: req.userRole === 'admin' ? owner_id : req.userId, limit, offset });
    res.json({ orders, total: orders.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/stats', authMiddleware, async (req, res) => {
  try { const { owner_id, date_from, date_to } = req.query; res.json(await erp.orders.getOrderStats({ owner_id: req.userRole === 'admin' ? owner_id : undefined, date_from, date_to })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/overdue', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.orders.getOverdueOrders(parseInt(req.query.days) || 3)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/orders/:id', authMiddleware, async (req, res) => {
  try { const o = await erp.orders.getOrder(req.params.id); if (!o) return res.status(404).json({ error: 'Order not found' }); res.json(o); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const resolvedOwnerId = req.userRole === 'admin' && req.body.owner_id ? req.body.owner_id : req.userId;
    const order = await erp.orders.createOrder({ ...req.body, owner_id: resolvedOwnerId });
    res.json(order);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, ...extra } = req.body;
    res.json(await erp.orders.updateOrderStatus(req.params.id, status, extra));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/orders/:id/pay', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.orders.payOrder(req.params.id, req.body)); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/orders/:id/cancel', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.orders.cancelOrder(req.params.id, req.body.reason)); } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/orders/:id/delivery', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.orders.createDelivery(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== TRANSACTIONS / FINANCE ====================

router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const { type, category, status, payment_method, order_id, customer_id, date_from, date_to, search } = req.query;
    const { limit, offset } = paginated(req);
    const transactions = await erp.finance.listTransactions({ type, category, status, payment_method, order_id, customer_id, date_from, date_to, search, limit, offset });
    res.json({ transactions, total: transactions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/finance/dashboard', authMiddleware, async (req, res) => {
  try { const { owner_id, date_from, date_to } = req.query; res.json(await erp.finance.getFinancialDashboard({ owner_id: req.userRole === 'admin' ? owner_id : undefined, date_from, date_to })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/finance/summary', authMiddleware, async (req, res) => {
  try { const { owner_id, date_from, date_to } = req.query; res.json(await erp.finance.getFinancialSummary({ owner_id: req.userRole === 'admin' ? owner_id : undefined, date_from, date_to })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transactions', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.finance.createTransaction({ ...req.body, owner_id: req.userId })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/transactions/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.finance.updateTransaction(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== PAYMENT LINKS ====================

router.post('/payment-links', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.finance.createPaymentLink(req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/payment-links/:id/pay', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.finance.markPaymentLinkPaid(req.params.id, req.body.external_id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== SITE CMS ====================

router.get('/site/sections', authMiddleware, async (req, res) => {
  try {
    const { type, language } = req.query;
    const sections = await erp.site.listSections({ type, language: language || 'pt-BR', is_active: true });
    res.json({ sections });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/site/sections/all', authMiddleware, adminMiddleware, async (req, res) => {
  try { const { type, language } = req.query; res.json({ sections: await erp.site.listSections({ type, language }) }); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/site/sections/:id', authMiddleware, async (req, res) => {
  try { const s = await erp.site.getSection(req.params.id); if (!s) return res.status(404).json({ error: 'Section not found' }); res.json(s); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/site/sections', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.site.createSection(req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/site/sections/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.site.updateSection(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/site/sections/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.site.deleteSection(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/site/sections/reorder', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.site.reorderSections(req.body.ordered_ids)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== STOCK ALERTS ====================

router.get('/stock/low', authMiddleware, async (req, res) => {
  try { res.json(await erp.products.getLowStockProducts(parseInt(req.query.threshold) || undefined)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== SUPPLIERS ====================

router.get('/suppliers', authMiddleware, async (req, res) => {
  try {
    const { search, category, is_active, owner_id } = req.query;
    const suppliers = await erp.suppliers.listSuppliers({ search, category, is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined, owner_id });
    res.json({ suppliers, total: suppliers.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/suppliers/stats', authMiddleware, async (req, res) => {
  try { res.json(await erp.suppliers.getSupplierStats()); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/suppliers/:id', authMiddleware, async (req, res) => {
  try { const s = await erp.suppliers.getSupplier(req.params.id); if (!s) return res.status(404).json({ error: 'Supplier not found' }); res.json(s); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/suppliers', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.suppliers.createSupplier({ ...req.body, owner_id: req.userId })); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/suppliers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.suppliers.updateSupplier(req.params.id, req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/suppliers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await erp.suppliers.deleteSupplier(req.params.id)); } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== NOTIFICATIONS ====================

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const { limit: qLimit, offset: qOffset } = paginated(req);
    const [rows] = await pool.execute('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?', [qLimit, qOffset]);
    res.json({ notifications: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== COUPONS ====================

router.get('/coupons', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM coupon_codes ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/coupons', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { code, type, value, min_value, max_uses, description, expires_at, is_active } = req.body;
    if (!code || value === undefined) return res.status(400).json({ error: 'Code and value are required' });
    const [result] = await pool.execute(
      'INSERT INTO coupon_codes (code, type, value, min_value, max_uses, description, expires_at, is_active, owner_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [code.toUpperCase(), type || 'percentage', value, min_value || 0, max_uses || null, description || null, expires_at || null, is_active !== false ? 1 : 0, req.userId || null]
    );
    const [rows] = await pool.execute('SELECT * FROM coupon_codes WHERE code = ?', [code.toUpperCase()]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Coupon code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/coupons/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const fields = [];
    const vals = [];
    const allowed = ['code', 'type', 'value', 'min_value', 'max_uses', 'description', 'expires_at', 'is_active'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { fields.push(`${key} = ?`); vals.push(key === 'code' ? req.body[key].toUpperCase() : req.body[key]); }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    await pool.execute(`UPDATE coupon_codes SET ${fields.join(', ')} WHERE id = ?`, vals);
    const [rows] = await pool.execute('SELECT * FROM coupon_codes WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/coupons/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await pool.execute('DELETE FROM coupon_codes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;