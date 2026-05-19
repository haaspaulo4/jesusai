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
      title: { 'pt-BR': 'Qual persona você precisa?', 'en-US': 'Which persona do you need?', 'es-ES': '¿Qué persona necesitas?' },
      subtitle: { 'pt-BR': 'Crie assistentes virtuais com identidade própria, conhecimento real e voz natural.', 'en-US': 'Create virtual assistants with their own identity, real knowledge and natural voice.', 'es-ES': 'Crea asistentes virtuales con identidad propia, conocimiento real y voz natural.' },
      settings: { cta_text: { 'pt-BR': 'Começar a conversar', 'en-US': 'Start chatting', 'es-ES': 'Empezar a chatear' }, cta_secondary: { 'pt-BR': 'Ver todas as personas', 'en-US': 'See all personas', 'es-ES': 'Ver todas las personas' }, show_badge: true, badge_text: 'RAG Multimodal' },
      position: 0,
    },
    {
      section_key: 'landing_features', type: 'features',
      title: { 'pt-BR': 'Recursos', 'en-US': 'Features', 'es-ES': 'Recursos' },
      items: [
        { icon: '💬', title: { 'pt-BR': 'Conversa inteligente', 'en-US': 'Smart conversation', 'es-ES': 'Conversación inteligente' }, desc: { 'pt-BR': 'Respostas fundamentadas no conhecimento indexado, com memória e contexto.', 'en-US': 'Answers grounded in indexed knowledge, with memory and context.', 'es-ES': 'Respuestas fundamentadas en conocimiento indexado, con memoria y contexto.' } },
        { icon: '🧠', title: { 'pt-BR': 'Memória e contexto', 'en-US': 'Memory and context', 'es-ES': 'Memoria y contexto' }, desc: { 'pt-BR': 'Lembra do seu nome, seus interesses e suas conversas anteriores.', 'en-US': 'Remembers your name, interests and previous conversations.', 'es-ES': 'Recuerda tu nombre, intereses y conversaciones anteriores.' } },
        { icon: '🔊', title: { 'pt-BR': 'Voz natural', 'en-US': 'Natural voice', 'es-ES': 'Voz natural' }, desc: { 'pt-BR': 'Ouça as respostas em áudio com TTS em português, inglês ou espanhol.', 'en-US': 'Listen to answers in audio with TTS in Portuguese, English or Spanish.', 'es-ES': 'Escucha las respuestas en audio con TTS en portugués, inglés o español.' } },
        { icon: '🌍', title: { 'pt-BR': '3 idiomas', 'en-US': '3 languages', 'es-ES': '3 idiomas' }, desc: { 'pt-BR': 'Responde automaticamente no idioma que você usar.', 'en-US': 'Responds automatically in the language you use.', 'es-ES': 'Responde automáticamente en el idioma que uses.' } },
        { icon: '📦', title: { 'pt-BR': 'Produtos e pedidos', 'en-US': 'Products and orders', 'es-ES': 'Productos y pedidos' }, desc: { 'pt-BR': 'Catálogo, carrinho, PIX, entregas e cobrança automática.', 'en-US': 'Catalog, cart, PIX payments, deliveries and automatic billing.', 'es-ES': 'Catálogo, carrito, PIX, entregas y cobro automático.' } },
        { icon: '📊', title: { 'pt-BR': 'Dashboard completo', 'en-US': 'Full dashboard', 'es-ES': 'Dashboard completo' }, desc: { 'pt-BR': 'Financeiro, estoque, vendas, clientes — tudo gerenciável.', 'en-US': 'Financial, inventory, sales, customers — all manageable.', 'es-ES': 'Financiero, inventario, ventas, clientes — todo gestionable.' } },
      ],
      position: 1,
    },
    {
      section_key: 'landing_cta', type: 'cta',
      title: { 'pt-BR': 'Pronto para conversar?', 'en-US': 'Ready to chat?', 'es-ES': '¿Listo para chatear?' },
      subtitle: { 'pt-BR': 'Comece agora — grátis, sem fila, 24 horas por dia.', 'en-US': 'Start now — free, no queue, 24 hours a day.', 'es-ES': 'Empieza ahora — gratis, sin fila, 24 horas al día.' },
      settings: { cta_text: { 'pt-BR': 'Conversar agora', 'en-US': 'Chat now', 'es-ES': 'Chatear ahora' } },
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