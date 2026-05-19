const { pool } = require('../db');

function generateId(prefix = 'sup') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function createSupplier(data) {
  const id = data.id || generateId('sup');
  const address = data.address ? JSON.stringify(data.address) : null;
  const tags = data.tags ? JSON.stringify(data.tags) : null;
  const metadata = data.metadata ? JSON.stringify(data.metadata) : null;
  await pool.execute(
    `INSERT INTO suppliers (id, name, trade_name, document, email, phone, whatsapp, address, city, state,
     country, website, contact_name, contact_role, category, tags, notes, rating, payment_terms,
     delivery_time_days, minimum_order, is_active, owner_id, metadata)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.name, data.trade_name || null, data.document || null, data.email || null,
    data.phone || null, data.whatsapp || null, address, data.city || null, data.state || null,
    data.country || 'Brasil', data.website || null, data.contact_name || null, data.contact_role || null,
    data.category || null, tags, data.notes || null, data.rating || null, data.payment_terms || null,
    data.delivery_time_days || null, data.minimum_order || null, data.is_active !== false ? 1 : 0,
    data.owner_id || null, metadata]
  );
  return getSupplier(id);
}

async function getSupplier(id) {
  const [rows] = await pool.execute('SELECT * FROM suppliers WHERE id = ?', [id]);
  return rows.length > 0 ? deserializeSupplier(rows[0]) : null;
}

async function listSuppliers(filters = {}) {
  let query = 'SELECT * FROM suppliers WHERE 1=1';
  const params = [];
  if (filters.is_active !== undefined) { query += ' AND is_active = ?'; params.push(filters.is_active ? 1 : 0); }
  if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters.search) { query += ' AND (name LIKE ? OR trade_name LIKE ? OR document LIKE ? OR contact_name LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  if (filters.owner_id) { query += ' AND owner_id = ?'; params.push(filters.owner_id); }
  query += ' ORDER BY name';
  const limit = Math.min(parseInt(filters.limit) || 100, 200);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);
  query += ` LIMIT ${limit} OFFSET ${offset}`;
  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeSupplier);
}

async function updateSupplier(id, updates) {
  const allowed = ['name', 'trade_name', 'document', 'email', 'phone', 'whatsapp', 'city', 'state', 'country', 'website', 'contact_name', 'contact_role', 'category', 'notes', 'rating', 'payment_terms', 'delivery_time_days', 'minimum_order', 'is_active'];
  const jsonFields = ['address', 'tags', 'metadata'];
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (jsonFields.includes(k)) { fields.push(`${k} = ?`); values.push(JSON.stringify(v)); }
    else if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (fields.length === 0) return getSupplier(id);
  values.push(id);
  await pool.execute(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`, values);
  return getSupplier(id);
}

async function deleteSupplier(id) {
  await pool.execute('DELETE FROM suppliers WHERE id = ?', [id]);
  return { deleted: true };
}

async function getSupplierProducts(supplierId) {
  const [rows] = await pool.execute(
    'SELECT p.* FROM products p WHERE p.metadata LIKE ? AND p.is_active = 1',
    [`%"supplier_id":"${supplierId}"%`]
  );
  return rows.length;
}

async function getSupplierStats() {
  const [total] = await pool.execute('SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active FROM suppliers');
  const [byCategory] = await pool.execute('SELECT category, COUNT(*) as count FROM suppliers GROUP BY category ORDER BY count DESC');
  return { total: total[0].total, active: total[0].active, by_category: byCategory };
}

function deserializeSupplier(row) {
  return {
    ...row,
    minimum_order: row.minimum_order ? parseFloat(row.minimum_order) : null,
    address: typeof row.address === 'string' ? JSON.parse(row.address) : (row.address || {}),
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    is_active: !!row.is_active,
  };
}

module.exports = {
  createSupplier, getSupplier, listSuppliers, updateSupplier, deleteSupplier, getSupplierStats,
};