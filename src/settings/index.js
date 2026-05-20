const { pool } = require('../db');

let cache = {};
let loaded = false;

const DEFAULTS = {
  persona: 'jesus',
  tts_mode: 'kokoro',
  tts_voice: 'pm_alex',
  max_tokens: '4096',
  temperature: '0.7',
  rate_limit_guest: '20',
  rate_limit_user: '500',
  rate_limit_premium: '1000',
  rate_limit_admin: '9999',
  blog_enabled: 'true',
  telegram_enabled: 'true',
  whatsapp_enabled: 'true',
  stt_enabled: 'true',
  tts_enabled: 'true',
  llm_failover_enabled: 'true',
  llm_max_retries: '3',
  llm_timeout: '30000',
  admin_notify_low_keys: 'true',
  blog_model: '',
  chat_model: '',
  summary_model: '',
  notifications_email: '',
  survey_enabled: 'true',
  survey_trigger_after_messages: '5',
  followup_enabled: 'true',
  followup_interval_messages: '10',
  followup_types: 'check_in,daily_content,engagement_request',
  followup_interval_messages: '10',
  ratings_enabled: 'true',
  rating_categories: 'general,response_quality,empathy,helpfulness',
  onboarding_enabled: 'true',
  followup_interval_messages: '10',
  followup_types: 'spiritual_check,daily_devotional,prayer_request',
  brand_name: '',
  brand_tagline: '',
  brand_logo_url: '',
  brand_primary_color: '',
  brand_secondary_color: '',
  onboarding_greeting: '',
  onboarding_greeting_en: '',
  onboarding_greeting_es: '',
  message_chunk_size: '200',
  audio_chunk_size: '200',
  tools_enabled: 'true',
  history_limit: '10',
  search_verses_count: '8',
  context_aware_search: 'true',
  context_compiler_enabled: 'true',
  context_max_tokens: '4000',
  context_prioritize: '',
  planner_enabled: 'true',
  summary_every: '10',
  profile_summary_every: '15',
  // Platform Identity
  platform_avatar_style: 'realistic',
  platform_emoji_style: 'native',
  platform_animation_style: 'subtle',
  platform_font_family: 'Inter',
  // Landing Page Content
  landing_hero_title_pt: '',
  landing_hero_title_en: '',
  landing_hero_title_es: '',
  landing_hero_subtitle_pt: '',
  landing_hero_subtitle_en: '',
  landing_hero_subtitle_es: '',
  landing_hero_cta_pt: '',
  landing_hero_cta_en: '',
  landing_hero_cta_es: '',
  landing_features_json: '',
  landing_how_it_works_json: '',
  landing_cta_title_pt: '',
  landing_cta_title_en: '',
  landing_cta_title_es: '',
  landing_cta_subtitle_pt: '',
  landing_cta_subtitle_en: '',
  landing_cta_subtitle_es: '',
  landing_cta_button_pt: '',
  landing_cta_button_en: '',
  landing_cta_button_es: '',
  store_currency: 'BRL',
  store_currency_symbol: 'R$',
  store_whatsapp: '',
  store_hero_video: '',
  store_footer_text: '',
  store_instagram_url: '',
  store_facebook_url: '',
  store_tiktok_url: '',
  store_cookie_consent: 'true',
  store_delivery_fee: '7',
  store_free_delivery_above: '90',
  store_delivery_zones: '[{"name":"Centro","keywords":["centro","downtown","praca","praca da matriz"],"fee":0,"estimated_minutes":"20-30"},{"name":"Raio 3km","keywords":["bairro","jardim","vila","parque","residencial"],"fee":5,"estimated_minutes":"30-40"},{"name":"Raio 5km","keywords":["distrito","rural","rodovia","km"],"fee":7,"estimated_minutes":"35-45"},{"name":"Premium","keywords":["condominio","alphaville","loteamento","lote"],"fee":10,"estimated_minutes":"40-55"}]',
  store_payment_methods: 'pix,dinheiro,cartao_credito,cartao_debito',
  store_pix_key: '',
  store_pix_name: '',
  store_bank_info: '',
  commerce_enabled: 'true',
};

async function loadSettings() {
  if (loaded) return;
  try {
    const [rows] = await pool.execute('SELECT setting_key, setting_value FROM settings');
    for (const row of rows) {
      cache[row.setting_key] = row.setting_value;
    }
    loaded = true;
  } catch (err) {
    console.error('[Settings] Failed to load:', err.message);
  }
}

async function getSetting(key, defaultValue) {
  await loadSettings();
  if (cache[key] !== undefined) return cache[key];
  if (defaultValue !== undefined) return defaultValue;
  return DEFAULTS[key] || null;
}

async function setSetting(key, value) {
  await loadSettings();
  await pool.execute(
    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [key, String(value)]
  );
  cache[key] = String(value);
  return { key, value: String(value) };
}

async function getAllSettings() {
  await loadSettings();
  const result = { ...DEFAULTS, ...cache };
  return result;
}

async function deleteSetting(key) {
  await pool.execute('DELETE FROM settings WHERE setting_key = ?', [key]);
  delete cache[key];
}

function invalidateCache() {
  cache = {};
  loaded = false;
}

module.exports = {
  getSetting,
  setSetting,
  getAllSettings,
  deleteSetting,
  invalidateCache,
  DEFAULTS,
  loadSettings,
  getDefaultPersonaId: () => cache.persona || DEFAULTS.persona || 'jesus',
};