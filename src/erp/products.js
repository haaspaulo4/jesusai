const { pool } = require('../db');

function generateId(prefix = 'prod') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function createProduct(data) {
  const id = data.id || generateId('prod');
  const slug = data.slug || slugify(data.name);
  const images = data.images ? JSON.stringify(data.images) : null;
  const technicalSpecs = data.technical_specs ? JSON.stringify(data.technical_specs) : null;
  const tags = data.tags ? JSON.stringify(data.tags) : null;
  const dimensions = data.dimensions ? JSON.stringify(data.dimensions) : null;
  const meta = data.meta ? JSON.stringify(data.meta) : null;

  await pool.execute(
    `INSERT INTO products (id, type, name, name_en, name_es, slug, description, description_en, description_es,
     category, subcategory, brand, price, cost_price, compare_at_price, currency, sku, barcode,
     stock, low_stock_threshold, track_stock, weight, weight_unit, dimensions, images, featured_image,
     technical_specs, seo_title, seo_description, tags, is_featured, is_active, is_digital, digital_file,
     visibility, meta, persona_id, owner_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.type || 'physical', data.name, data.name_en || null, data.name_es || null, slug,
    data.description || null, data.description_en || null, data.description_es || null,
    data.category || null, data.subcategory || null, data.brand || null,
    data.price || 0, data.cost_price || 0, data.compare_at_price || null,
    data.currency || 'BRL', data.sku || null, data.barcode || null,
    data.stock || 0, data.low_stock_threshold || 5, data.track_stock !== false ? 1 : 0,
    data.weight || null, data.weight_unit || 'g', dimensions, images, data.featured_image || null,
    technicalSpecs, data.seo_title || null, data.seo_description || null, tags,
    data.is_featured ? 1 : 0, data.is_active !== false ? 1 : 0, data.is_digital ? 1 : 0, data.digital_file || null,
    data.visibility || 'public', meta, data.persona_id || null, data.owner_id || null,
    ]
  );

  if (data.variants && data.variants.length > 0) {
    for (const v of data.variants) {
      await createVariant(id, v);
    }
  }

  return getProduct(id);
}

function slugify(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function createVariant(productId, data) {
  const id = data.id || generateId('var');
  const options = data.options ? JSON.stringify(data.options) : null;
  const dimensions = data.dimensions ? JSON.stringify(data.dimensions) : null;

  await pool.execute(
    `INSERT INTO product_variants (id, product_id, name, sku, barcode, price, cost_price, compare_at_price,
     stock, low_stock_threshold, weight, weight_unit, dimensions, image, options, is_active, position)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, productId, data.name, data.sku || null, data.barcode || null,
    data.price, data.cost_price, data.compare_at_price,
    data.stock || 0, data.low_stock_threshold || 5,
    data.weight, data.weight_unit || 'g', dimensions, data.image || null, options,
    data.is_active !== false ? 1 : 0, data.position || 0,
    ]
  );
  return getVariant(id);
}

async function getProduct(productId) {
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [productId]);
  if (rows.length === 0) return null;
  const product = deserializeProduct(rows[0]);
  const [variants] = await pool.execute('SELECT * FROM product_variants WHERE product_id = ? ORDER BY position', [productId]);
  product.variants = variants.map(deserializeVariant);
  return product;
}

async function getVariant(variantId) {
  const [rows] = await pool.execute('SELECT * FROM product_variants WHERE id = ?', [variantId]);
  return rows.length > 0 ? deserializeVariant(rows[0]) : null;
}

async function listProducts(filters = {}) {
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (filters.type) { query += ' AND type = ?'; params.push(filters.type); }
  if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters.is_active !== undefined) { query += ' AND is_active = ?'; params.push(filters.is_active ? 1 : 0); }
  if (filters.is_featured !== undefined) { query += ' AND is_featured = ?'; params.push(filters.is_featured ? 1 : 0); }
  if (filters.owner_id) { query += ' AND owner_id = ?'; params.push(filters.owner_id); }
  if (filters.persona_id) { query += ' AND (persona_id = ? OR persona_id IS NULL)'; params.push(filters.persona_id); }
  if (filters.search) { query += ' AND (name LIKE ? OR description LIKE ? OR sku LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }

  query += ' ORDER BY is_featured DESC, created_at DESC';

  const limit = Math.min(parseInt(filters.limit) || 50, 200);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);
  query += ` LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeProduct);
}

async function updateProduct(productId, updates) {
  const allowedFields = ['name', 'name_en', 'name_es', 'description', 'description_en', 'description_es',
    'category', 'subcategory', 'brand', 'price', 'cost_price', 'compare_at_price', 'sku', 'barcode',
    'stock', 'low_stock_threshold', 'track_stock', 'weight', 'weight_unit', 'featured_image',
    'is_featured', 'is_active', 'is_digital', 'digital_file', 'visibility', 'seo_title', 'seo_description'];
  const jsonFields = ['images', 'technical_specs', 'tags', 'dimensions', 'meta'];
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (jsonFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(JSON.stringify(value));
    } else if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return getProduct(productId);
  values.push(productId);
  await pool.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
  return getProduct(productId);
}

async function deleteProduct(productId) {
  await pool.execute('DELETE FROM product_variants WHERE product_id = ?', [productId]);
  await pool.execute('DELETE FROM products WHERE id = ?', [productId]);
  return { deleted: true };
}

async function adjustStock(productId, variantId, type, quantity, reason, orderId, ownerId) {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found');

  const previousStock = variantId
    ? (await getVariant(variantId))?.stock || 0
    : product.stock;

  let delta = 0;
  if (type === 'in' || type === 'return' || type === 'released') delta = Math.abs(quantity);
  else if (type === 'out' || type === 'reserved' || type === 'loss') delta = -Math.abs(quantity);
  else if (type === 'adjustment') delta = quantity;

  const newStock = previousStock + delta;

  if (variantId) {
    await pool.execute('UPDATE product_variants SET stock = ? WHERE id = ?', [Math.max(0, newStock), variantId]);
  }
  const totalProductStock = variantId
    ? await getTotalVariantStock(productId)
    : newStock;
  await pool.execute('UPDATE products SET stock = ? WHERE id = ?', [Math.max(0, totalProductStock), productId]);

  const id = generateId('stk');
  await pool.execute(
    `INSERT INTO stock_movements (id, product_id, variant_id, type, quantity, previous_stock, new_stock, reason, order_id, cost_per_unit, owner_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, productId, variantId, type, Math.abs(quantity), previousStock, Math.max(0, newStock), reason || null, orderId || null, null, ownerId || null]
  );

  if (newStock <= product.low_stock_threshold && product.track_stock) {
    const { emit } = require('../events');
    emit('stock_alert', { productId, variantId, currentStock: newStock, threshold: product.low_stock_threshold, product: product.name });
  }

  return { id, previousStock, newStock: Math.max(0, newStock) };
}

async function getTotalVariantStock(productId) {
  const [rows] = await pool.execute('SELECT COALESCE(SUM(stock), 0) as total FROM product_variants WHERE product_id = ? AND is_active = 1', [productId]);
  return rows[0].total;
}

async function getLowStockProducts(threshold) {
  const [rows] = await pool.execute(
    'SELECT * FROM products WHERE track_stock = 1 AND stock <= COALESCE(?, low_stock_threshold) AND is_active = 1 ORDER BY stock ASC',
    [threshold]
  );
  return rows.map(deserializeProduct);
}

async function getProductsByCategory(categorySlug) {
  const [cats] = await pool.execute('SELECT id FROM product_categories WHERE slug = ?', [categorySlug]);
  if (cats.length === 0) return [];
  const [rows] = await pool.execute('SELECT * FROM products WHERE category = ? AND is_active = 1 ORDER BY is_featured DESC, created_at DESC', [cats[0].id]);
  return rows.map(deserializeProduct);
}

async function getCategoryTree() {
  const [rows] = await pool.execute('SELECT * FROM product_categories WHERE is_active = 1 ORDER BY position, name');
  return rows.map(r => ({
    ...r, name_en: r.name_en, name_es: r.name_es,
    product_count: 0,
  }));
}

async function createCategory(data) {
  const id = data.id || generateId('cat');
  const slug = data.slug || slugify(data.name);
  await pool.execute(
    'INSERT INTO product_categories (id, name, name_en, name_es, slug, description, image, icon, parent_id, position, is_active, product_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, data.name, data.name_en || null, data.name_es || null, slug, data.description || null, data.image || null, data.icon || null, data.parent_id || null, data.position || 0, data.is_active !== false ? 1 : 0, data.product_type || 'all']
  );
  return getCategory(id);
}

async function getCategory(catId) {
  const [rows] = await pool.execute('SELECT * FROM product_categories WHERE id = ?', [catId]);
  return rows.length > 0 ? rows[0] : null;
}

async function getProductStats() {
  const [total] = await pool.execute('SELECT COUNT(*) as total FROM products WHERE is_active = 1');
  const [byType] = await pool.execute('SELECT type, COUNT(*) as count, SUM(stock) as total_stock, SUM(price * stock) as inventory_value FROM products WHERE is_active = 1 GROUP BY type');
  const [lowStock] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE track_stock = 1 AND stock <= low_stock_threshold AND is_active = 1');
  const [featured] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE is_featured = 1 AND is_active = 1');
  const [outOfStock] = await pool.execute('SELECT COUNT(*) as count FROM products WHERE track_stock = 1 AND stock = 0 AND is_active = 1');
  return {
    total: total[0].total,
    by_type: byType.map(r => ({ type: r.type, count: r.count, total_stock: r.total_stock || 0, inventory_value: parseFloat(r.inventory_value) || 0 })),
    low_stock: lowStock[0].count,
    featured: featured[0].count,
    out_of_stock: outOfStock[0].count,
  };
}

function deserializeProduct(row) {
  return {
    ...row,
    price: parseFloat(row.price),
    cost_price: parseFloat(row.cost_price),
    compare_at_price: row.compare_at_price ? parseFloat(row.compare_at_price) : null,
    images: typeof row.images === 'string' ? JSON.parse(row.images) : (row.images || []),
    technical_specs: typeof row.technical_specs === 'string' ? JSON.parse(row.technical_specs) : (row.technical_specs || {}),
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []),
    dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : (row.dimensions || null),
    meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : (row.meta || {}),
    is_active: !!row.is_active,
    is_featured: !!row.is_featured,
    is_digital: !!row.is_digital,
    track_stock: !!row.track_stock,
  };
}

function deserializeVariant(row) {
  return {
    ...row,
    price: row.price !== null ? parseFloat(row.price) : null,
    cost_price: row.cost_price !== null ? parseFloat(row.cost_price) : null,
    compare_at_price: row.compare_at_price !== null ? parseFloat(row.compare_at_price) : null,
    dimensions: typeof row.dimensions === 'string' ? JSON.parse(row.dimensions) : (row.dimensions || null),
    options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options || {}),
    is_active: !!row.is_active,
  };
}

module.exports = {
  createProduct, getProduct, listProducts, updateProduct, deleteProduct,
  createVariant, getVariant,
  adjustStock, getLowStockProducts, getProductsByCategory,
  getCategoryTree, createCategory, getCategory, getProductStats,
};