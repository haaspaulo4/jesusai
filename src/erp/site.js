const { pool } = require('../db');

function generateId(prefix = 'sec') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

async function createSection(data) {
  const id = generateId('sec');
  const title = data.title ? JSON.stringify(data.title) : null;
  const subtitle = data.subtitle ? JSON.stringify(data.subtitle) : null;
  const content = data.content ? JSON.stringify(data.content) : null;
  const items = data.items ? JSON.stringify(data.items) : null;
  const settings = data.settings ? JSON.stringify(data.settings) : null;
  const mediaIds = data.media_ids ? JSON.stringify(data.media_ids) : null;

  await pool.execute(
    `INSERT INTO site_sections (id, section_key, type, title, subtitle, content, items, settings, media_ids, position, is_active, persona_id, language)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.section_key, data.type || 'custom', title, subtitle, content, items, settings, mediaIds,
    data.position || 0, data.is_active !== false ? 1 : 0, data.persona_id || null, data.language || 'pt-BR']
  );
  return getSection(id);
}

async function getSection(id) {
  const [rows] = await pool.execute('SELECT * FROM site_sections WHERE id = ?', [id]);
  return rows.length > 0 ? deserializeSection(rows[0]) : null;
}

async function getSectionByKey(sectionKey, language = null) {
  let query = 'SELECT * FROM site_sections WHERE section_key = ? AND is_active = 1';
  const params = [sectionKey];
  if (language) { query += ' AND language = ?'; params.push(language); }
  else { query += ' AND language = \'pt-BR\''; }
  query += ' ORDER BY position LIMIT 1';
  const [rows] = await pool.execute(query, params);
  return rows.length > 0 ? deserializeSection(rows[0]) : null;
}

async function listSections(filters = {}) {
  let query = 'SELECT * FROM site_sections WHERE 1=1';
  const params = [];
  if (filters.type) { query += ' AND type = ?'; params.push(filters.type); }
  if (filters.is_active !== undefined) { query += ' AND is_active = ?'; params.push(filters.is_active ? 1 : 0); }
  if (filters.persona_id) { query += ' AND (persona_id = ? OR persona_id IS NULL)'; params.push(filters.persona_id); }
  if (filters.language) { query += ' AND language = ?'; params.push(filters.language); }
  query += ' ORDER BY position, created_at';
  const [rows] = await pool.execute(query, params);
  return rows.map(deserializeSection);
}

async function updateSection(id, updates) {
  const jsonFields = ['title', 'subtitle', 'content', 'items', 'settings', 'media_ids'];
  const simpleFields = ['section_key', 'type', 'position', 'is_active', 'persona_id', 'language'];
  const fields = [];
  const values = [];
  for (const [k, v] of Object.entries(updates)) {
    if (jsonFields.includes(k)) { fields.push(`${k} = ?`); values.push(JSON.stringify(v)); }
    else if (simpleFields.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (fields.length === 0) return getSection(id);
  values.push(id);
  await pool.execute(`UPDATE site_sections SET ${fields.join(', ')} WHERE id = ?`, values);
  return getSection(id);
}

async function deleteSection(id) {
  await pool.execute('DELETE FROM site_sections WHERE id = ?', [id]);
  return { deleted: true };
}

async function reorderSections(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.execute('UPDATE site_sections SET position = ? WHERE id = ?', [i, orderedIds[i]]);
  }
  return { reordered: true };
}

function deserializeSection(row) {
  return {
    ...row,
    title: typeof row.title === 'string' ? JSON.parse(row.title) : (row.title || {}),
    subtitle: typeof row.subtitle === 'string' ? JSON.parse(row.subtitle) : (row.subtitle || {}),
    content: typeof row.content === 'string' ? JSON.parse(row.content) : (row.content || {}),
    items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
    settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings || {}),
    media_ids: typeof row.media_ids === 'string' ? JSON.parse(row.media_ids) : (row.media_ids || []),
    is_active: !!row.is_active,
  };
}

async function seedDefaultSections() {
  const [existing] = await pool.execute("SELECT COUNT(*) as cnt FROM site_sections WHERE section_key LIKE 'landing_%' AND language = 'pt-BR'");
  if (existing[0].cnt > 0) return;

  const defaults = [
    {
      section_key: 'landing_hero', type: 'hero',
      title: { 'pt-BR': 'Perfumes que contam histórias', 'en-US': 'Fragrances that tell stories', 'es-ES': 'Perfumes que cuentan historias' },
      subtitle: { 'pt-BR': 'Fragrâncias exclusivas das maiores marcas árabes, entregues com carinho na sua porta.', 'en-US': 'Exclusive fragrances from the greatest Arabian brands, delivered with care to your door.', 'es-ES': 'Fragancias exclusivas de las mejores marcas árabes, entregadas con cariño en su puerta.' },
      settings: { cta_text: { 'pt-BR': 'Ver Catálogo', 'en-US': 'View Catalog', 'es-ES': 'Ver Catálogo' }, cta_secondary: { 'pt-BR': 'Destaques', 'en-US': 'Featured', 'es-ES': 'Destacados' }, show_badge: true, badge_text: { 'pt-BR': '✦ Importados & Originais ✦', 'en-US': '✦ Imported & Original ✦', 'es-ES': '✦ Importados & Originales ✦' } },
      position: 0,
    },
    {
      section_key: 'landing_features', type: 'features',
      title: { 'pt-BR': 'Por que escolher a gente?', 'en-US': 'Why choose us?', 'es-ES': '¿Por qué elegirnos?' },
      items: [
        { icon: '✓', title: { 'pt-BR': '100% Originais', 'en-US': '100% Original', 'es-ES': '100% Original' }, desc: { 'pt-BR': 'Todos os nossos perfumes são importados e originais, com garantia de autenticidade.', 'en-US': 'All our fragrances are imported and original, with authenticity guarantee.', 'es-ES': 'Todos nuestros perfumes son importados y originales, con garantía de autenticidad.' } },
        { icon: '✈', title: { 'pt-BR': 'Envio pra Todo Brasil', 'en-US': 'Nationwide Shipping', 'es-ES': 'Envío a Todo Brasil' }, desc: { 'pt-BR': 'Entregamos em todo o território nacional com embalagem especial e rastreio.', 'en-US': 'We deliver nationwide with special packaging and tracking.', 'es-ES': 'Entregamos en todo el territorio nacional con embalaje especial y rastreo.' } },
        { icon: '💬', title: { 'pt-BR': 'Atendimento VIP', 'en-US': 'VIP Support', 'es-ES': 'Atención VIP' }, desc: { 'pt-BR': 'Fale direto conosco pelo WhatsApp. Tire dúvidas e faça seu pedido!', 'en-US': 'Talk directly with us on WhatsApp. Ask questions and place your order!', 'es-ES': 'Hable directamente con nosotros por WhatsApp. ¡Resuelva dudas y haga su pedido!' } },
      ],
      position: 1,
    },
    {
      section_key: 'landing_cta', type: 'cta',
      title: { 'pt-BR': 'Pronto para encontrar seu perfume ideal?', 'en-US': 'Ready to find your perfect fragrance?', 'es-ES': '¿Listo para encontrar tu perfume ideal?' },
      subtitle: { 'pt-BR': 'Comece agora — grátis, sem fila, 24 horas por dia.', 'en-US': 'Start now — free, no queue, 24 hours a day.', 'es-ES': 'Empieza ahora — gratis, sin fila, 24 horas al día.' },
      settings: { cta_text: { 'pt-BR': 'Falar no WhatsApp', 'en-US': 'Chat on WhatsApp', 'es-ES': 'Hablar por WhatsApp' } },
      position: 2,
    },
    {
      section_key: 'landing_products', type: 'gallery',
      title: { 'pt-BR': 'Nossos Produtos', 'en-US': 'Our Products', 'es-ES': 'Nuestros Productos' },
      settings: { show_prices: true, show_stock: true, columns: 3, show_categories: true },
      position: 3,
    },
  ];

  for (const d of defaults) {
    await createSection({ ...d, language: 'pt-BR' });
  }
  console.log('[ERP] Default site sections seeded');
}

module.exports = {
  createSection, getSection, getSectionByKey, listSections, updateSection, deleteSection, reorderSections, seedDefaultSections,
};