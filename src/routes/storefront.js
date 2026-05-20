const express = require('express');
const erp = require('../erp');
const settings = require('../settings');
const { pool } = require('../db');

const router = express.Router();

function lang(req, field) {
  const l = req.query.lang || 'pt-BR';
  if (!field) return l;
  if (typeof field === 'string') return field;
  return field[l] || field['pt-BR'] || field['en-US'] || Object.values(field)[0] || '';
}

router.get('/brand', async (req, res) => {
  try {
    const brandName = await settings.getSetting('brand_name', '');
    const brandTagline = await settings.getSetting('brand_tagline', '');
    const brandLogoUrl = await settings.getSetting('brand_logo_url', '');
    const brandPrimaryColor = await settings.getSetting('brand_primary_color', '#D4A843');
    const brandSecondaryColor = await settings.getSetting('brand_secondary_color', '#1a1a2e');
    const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
    const telegramBotUsername = process.env.TELEGRAM_BOT_USERNAME || '';
    const instagramUrl = await settings.getSetting('instagram_url', '');
    const facebookUrl = await settings.getSetting('facebook_url', '');
    const tiktokUrl = await settings.getSetting('tiktok_url', '');
    const currency = await settings.getSetting('store_currency', 'BRL');
    const currencySymbol = await settings.getSetting('store_currency_symbol', 'R$');
    res.json({
      brandName: brandName || 'MetaPersona.AI',
      brandTagline,
      brandLogoUrl,
      brandPrimaryColor,
      brandSecondaryColor,
      whatsappNumber,
      telegramBotUsername,
      telegramUrl: telegramBotUsername ? `https://t.me/${telegramBotUsername}` : null,
      whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}` : null,
      instagramUrl,
      facebookUrl,
      tiktokUrl,
      currency,
      currencySymbol,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sections', async (req, res) => {
  try {
    const l = req.query.lang || 'pt-BR';
    const type = req.query.type || null;
    const sections = await erp.site.listSections({ type, language: l, is_active: true });
    res.json({ sections: sections.map(s => ({
      id: s.id,
      key: s.section_key,
      type: s.type,
      title: lang(req, s.title),
      subtitle: lang(req, s.subtitle),
      content: lang(req, s.content),
      items: (s.items || []).map(item => {
        if (typeof item === 'string') return item;
        const mapped = {};
        for (const [k, v] of Object.entries(item)) {
          mapped[k] = typeof v === 'object' && v !== null ? (v[l] || v['pt-BR'] || Object.values(v)[0] || v) : v;
        }
        return mapped;
      }),
      settings: s.settings || {},
      mediaIds: s.media_ids || [],
      position: s.position,
    })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const { type, category, search, limit } = req.query;
    const products = await erp.products.listProducts({
      type: type || undefined,
      category: category || undefined,
      search: search || undefined,
      is_active: true,
      limit: limit ? parseInt(limit) : 200,
    });
    res.json({
      products: products.map(p => ({
        id: p.id,
        type: p.type,
        name: p.name,
        nameEn: p.name_en,
        nameEs: p.name_es,
        slug: p.slug,
        description: p.description,
        descriptionEn: p.description_en,
        descriptionEs: p.description_es,
        category: p.category,
        subcategory: p.subcategory,
        brand: p.brand,
        price: p.price,
        costPrice: p.cost_price,
        compareAtPrice: p.compare_at_price,
        currency: p.currency || 'BRL',
        sku: p.sku,
        stock: p.stock,
        lowStockThreshold: p.low_stock_threshold,
        trackStock: p.track_stock,
        images: p.images,
        featuredImage: p.featured_image,
        technicalSpecs: p.technical_specs,
        tags: p.tags,
        isFeatured: p.is_featured,
        isDigital: p.is_digital,
        weight: p.weight,
        weightUnit: p.weight_unit,
        variants: (p.variants || []).map(v => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compare_at_price,
          stock: v.stock,
          image: v.image,
          options: v.options,
          is_active: v.is_active,
        })),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const p = await erp.products.getProduct(req.params.id);
    if (!p || !p.is_active) return res.status(404).json({ error: 'Product not found' });
    res.json({
      id: p.id,
      type: p.type,
      name: p.name,
      nameEn: p.name_en,
      nameEs: p.name_es,
      slug: p.slug,
      description: p.description,
      descriptionEn: p.description_en,
      descriptionEs: p.description_es,
      category: p.category,
      subcategory: p.subcategory,
      brand: p.brand,
      price: p.price,
      costPrice: p.cost_price,
      compareAtPrice: p.compare_at_price,
      currency: p.currency || 'BRL',
      sku: p.sku,
      barcode: p.barcode,
      stock: p.stock,
      lowStockThreshold: p.low_stock_threshold,
      trackStock: p.track_stock,
      images: p.images,
      featuredImage: p.featured_image,
      technicalSpecs: p.technical_specs,
      tags: p.tags,
      isFeatured: p.is_featured,
      isDigital: p.is_digital,
      digitalFile: p.digital_file,
      weight: p.weight,
      weightUnit: p.weight_unit,
      dimensions: p.dimensions,
      seoTitle: p.seo_title,
      seoDescription: p.seo_description,
      variants: (p.variants || []).map(v => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compare_at_price,
        stock: v.stock,
        image: v.image,
        options: v.options,
        weight: v.weight,
        is_active: v.is_active,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/products/slug/:slug', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id FROM products WHERE slug = ? AND is_active = 1', [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const p = await erp.products.getProduct(rows[0].id);
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const tree = await erp.products.getCategoryTree();
    res.json({ categories: tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, items, coupon_code, notes, source } = req.body;
    if (!customer_name || !customer_phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Pelo menos um item é obrigatório' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE whatsapp_id = ? OR phone = ? LIMIT 1',
      [customer_phone, customer_phone]
    );
    let customerId = null;
    if (existing.length > 0) {
      customerId = existing[0].id;
      if (customer_email) {
        await pool.execute('UPDATE users SET email = COALESCE(NULLIF(?, ""), email) WHERE id = ?', [customer_email, customerId]);
      }
      if (customer_name) {
        await pool.execute('UPDATE users SET name = ? WHERE id = ?', [customer_name, customerId]);
      }
    }

    const orderItems = items.map(item => ({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      title: item.title || item.name || 'Produto',
      quantity: parseInt(item.quantity) || 1,
      unit_price: parseFloat(item.unit_price || item.price || 0),
      total: (parseFloat(item.unit_price || item.price || 0)) * (parseInt(item.quantity) || 1),
      type: item.type || 'physical',
    }));

    const subtotal = orderItems.reduce((sum, i) => sum + i.total, 0);
    let discount = 0;
    if (coupon_code) {
      const [coupons] = await pool.execute(
        "SELECT * FROM coupon_codes WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses)",
        [coupon_code.toUpperCase()]
      );
      if (coupons.length > 0) {
        const coupon = coupons[0];
        if (coupon.type === 'percentage') discount = subtotal * (coupon.value / 100);
        else discount = Math.min(coupon.value, subtotal);
        await pool.execute('UPDATE coupon_codes SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
      }
    }

    const order = await erp.orders.createOrder({
      customer_id: customerId,
      customer_name,
      customer_phone,
      customer_email: customer_email || null,
      items: orderItems,
      subtotal,
      discount,
      coupon_code: coupon_code || null,
      notes: notes || null,
      source: source || 'storefront',
      deduct_stock: true,
    });

    const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
    const message = formatWhatsAppOrder({ ...order, customer_name, customer_phone, items: orderItems, subtotal, discount });
    const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : null;

    res.json({ order: { id: order.id, orderNumber: order.order_number, total: order.total, status: order.status }, whatsappUrl });
  } catch (err) {
    console.error('[Storefront] Order creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

function formatWhatsAppOrder(o) {
  let msg = `*Novo Pedido #${o.order_number || o.id}*\n\n`;
  msg += `*Cliente:* ${o.customer_name}\n`;
  if (o.customer_phone) msg += `*WhatsApp:* ${o.customer_phone}\n`;
  if (o.customer_email) msg += `*Email:* ${o.customer_email}\n`;
  msg += `\n*Itens:*\n`;
  (o.items || []).forEach(i => {
    msg += `• ${i.title} x${i.quantity} — R$ ${(i.total || 0).toFixed(2)}\n`;
  });
  msg += `\n*Subtotal:* R$ ${(o.subtotal || 0).toFixed(2)}`;
  if (o.discount > 0) msg += `\n*Desconto:* -R$ ${o.discount.toFixed(2)}`;
  msg += `\n*Total:* R$ ${(o.total || 0).toFixed(2)}`;
  if (o.notes) msg += `\n\n*Observações:* ${o.notes}`;
  msg += '\n\nPoderia confirmar disponibilidade e valores de frete?';
  return msg;
}

router.get('/coupons/:code', async (req, res) => {
  try {
    const code = (req.params.code || '').toUpperCase();
    const [rows] = await pool.execute(
      "SELECT * FROM coupon_codes WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses)",
      [code]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Coupon not found or expired' });
    const c = rows[0];
    res.json({
      code: c.code,
      type: c.type,
      value: c.value,
      minValue: c.min_value,
      description: c.description,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== LOYALTY (PUBLIC) ==========
router.get('/loyalty/balance', async (req, res) => {
  try {
    const loyalty = require('../loyalty');
    const { getSetting } = require('../settings');
    const personaId = await getSetting('persona') || process.env.PERSONA || 'default';
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id is required' });
    const balance = await loyalty.getLoyaltyBalance(userId, personaId);
    res.json(balance);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/loyalty/rewards', async (req, res) => {
  try {
    const loyalty = require('../loyalty');
    const { getSetting } = require('../settings');
    const personaId = await getSetting('persona') || process.env.PERSONA || 'default';
    const rewards = await loyalty.getRewards(personaId);
    res.json(rewards);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/delivery/track/:orderId', async (req, res) => {
  try {
    const delivery = require('../erp/delivery');
    const assignment = await delivery.getOrderAssignment(req.params.orderId);
    if (!assignment) return res.json({ found: false });
    res.json({
      found: true,
      driver: assignment.driver_name,
      vehicle: assignment.vehicle_type,
      status: assignment.status,
      assigned_at: assignment.assigned_at,
      delivered_at: assignment.delivered_at,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;