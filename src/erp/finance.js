const { pool } = require('../db');

function generateId(prefix = 'txn') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function createTransaction(data) {
  const id = generateId('txn');
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  await pool.execute(
    `INSERT INTO transactions (id, type, category, amount, currency, payment_method, status, order_id, customer_id, description, reference, external_id, proof_url, due_date, paid_at, owner_id, persona_id, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.type, data.category || null, data.amount, data.currency || 'BRL', data.payment_method || null,
    data.status || 'pending', data.order_id || null, data.customer_id || null, data.description || null,
    data.reference || null, data.external_id || null, data.proof_url || null,
    data.due_date || null, data.paid_at || null, data.owner_id || null, data.persona_id || null, metadata]
  );
  return getTransaction(id);
}

async function getTransaction(id) {
  const [rows] = await pool.execute('SELECT * FROM transactions WHERE id = ?', [id]);
  return rows.length > 0 ? deserializeTransaction(rows[0]) : null;
}

async function listTransactions(filters = {}) {
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];
  if (filters.type) { query += ' AND type = ?'; params.push(filters.type); }
  if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters.status) { query += ' AND status = ?'; params.push(filters.status); }
  if (filters.payment_method) { query += ' AND payment_method = ?'; params.push(filters.payment_method); }
  if (filters.order_id) { query += ' AND order_id = ?'; params.push(filters.order_id); }
  if (filters.customer_id) { query += ' AND customer_id = ?'; params.push(filters.customer_id); }
  if (filters.owner_id) { query += ' AND owner_id = ?'; params.push(filters.owner_id); }
  if (filters.date_from) { query += ' AND created_at >= ?'; params.push(filters.date_from); }
  if (filters.date_to) { query += ' AND created_at <= ?'; params.push(filters.date_to); }
  if (filters.search) { query += ' AND (description LIKE ? OR reference LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`); }
  query += ' ORDER BY created_at DESC';
  const limit = Math.min(parseInt(filters.limit) || 50, 200);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);
  query += ` LIMIT ${limit} OFFSET ${offset}`;
  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeTransaction);
}

async function updateTransaction(id, updates) {
  const allowed = ['status', 'paid_at', 'proof_url', 'external_id', 'description', 'category', 'payment_method'];
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (fields.length === 0) return getTransaction(id);
  values.push(id);
  await pool.execute(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, values);
  return getTransaction(id);
}

async function createPaymentLink(data) {
  const id = generateId('pay');
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  const expiresAt = data.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await pool.execute(
    `INSERT INTO payment_links (id, order_id, amount, currency, provider, provider_id, payment_url, qr_code_base64, pix_code, status, customer_id, customer_email, customer_document, description, expires_at, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.order_id || null, data.amount, data.currency || 'BRL', data.provider || 'manual', data.provider_id || null,
    data.payment_url || null, data.qr_code_base64 || null, data.pix_code || null, 'active',
    data.customer_id || null, data.customer_email || null, data.customer_document || null,
    data.description || null, expiresAt, metadata]
  );
  return { id, amount: data.amount, url: data.payment_url, pix_code: data.pix_code, expires_at: expiresAt };
}

async function markPaymentLinkPaid(id, externalId) {
  await pool.execute('UPDATE payment_links SET status = ?, paid_at = NOW(), provider_id = COALESCE(?, provider_id) WHERE id = ?', ['paid', externalId || null, id]);
  return getPaymentLink(id);
}

async function getPaymentLink(id) {
  const [rows] = await pool.execute('SELECT * FROM payment_links WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
}

async function getFinancialDashboard(filters = {}) {
  let where = 'WHERE 1=1';
  const params = [];
  if (filters.owner_id) { where += ' AND owner_id = ?'; params.push(filters.owner_id); }
  if (filters.date_from) { where += ' AND created_at >= ?'; params.push(filters.date_from); }
  if (filters.date_to) { where += ' AND created_at <= ?'; params.push(filters.date_to); }

  const [revenue] = await pool.execute(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income' AND status = 'confirmed' THEN amount ELSE 0 END), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN type = 'expense' AND status = 'confirmed' THEN amount ELSE 0 END), 0) as total_expenses,
            COALESCE(SUM(CASE WHEN type = 'refund' AND status = 'confirmed' THEN amount ELSE 0 END), 0) as total_refunds,
            COALESCE(SUM(CASE WHEN type = 'income' AND status = 'pending' THEN amount ELSE 0 END), 0) as pending_income
     FROM transactions ${where}`,
    params
  );

  const [byMethod] = await pool.execute(
    `SELECT payment_method, type, SUM(amount) as total, COUNT(*) as count
     FROM transactions ${where} AND status = 'confirmed' AND type IN ('income', 'expense')
     GROUP BY payment_method, type`,
    params
  );

  const [byCategory] = await pool.execute(
    `SELECT category, type, SUM(amount) as total FROM transactions ${where} AND status = 'confirmed' GROUP BY category, type`,
    params
  );

  const [monthly] = await pool.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, type,
            SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END) as confirmed,
            SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending
     FROM transactions ${where} GROUP BY month, type ORDER BY month DESC`,
    params
  );

  const r = revenue[0];
  return {
    total_revenue: parseFloat(r.total_revenue),
    total_expenses: parseFloat(r.total_expenses),
    total_refunds: parseFloat(r.total_refunds),
    net_profit: parseFloat(r.total_revenue) - parseFloat(r.total_expenses) - parseFloat(r.total_refunds),
    pending_income: parseFloat(r.pending_income),
    by_method: byMethod.map(m => ({ ...m, total: parseFloat(m.total) })),
    by_category: byCategory.map(c => ({ ...c, total: parseFloat(c.total) })),
    monthly: monthly.map(m => ({ ...m, confirmed: parseFloat(m.confirmed), pending: parseFloat(m.pending) })),
  };
}

async function getOverduePayments(days = 3) {
  const [rows] = await pool.execute(
    'SELECT * FROM payment_links WHERE status = ? AND expires_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    ['active', days]
  );
  return rows;
}

async function getFinancialSummary(filters = {}) {
  const dash = await getFinancialDashboard(filters);
  const orders = require('./orders');
  const orderStats = await orders.getOrderStats(filters);
  return { ...dash, orders: orderStats };
}

function deserializeTransaction(row) {
  return {
    ...row,
    amount: parseFloat(row.amount),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
  };
}

module.exports = {
  createTransaction, getTransaction, listTransactions, updateTransaction,
  createPaymentLink, markPaymentLinkPaid, getPaymentLink,
  getFinancialDashboard, getOverduePayments, getFinancialSummary,
};