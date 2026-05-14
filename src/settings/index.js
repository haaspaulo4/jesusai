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
  followup_types: 'spiritual_check,daily_devotional,prayer_request',
  ratings_enabled: 'true',
  rating_categories: 'general,spiritual,response_quality,empathy',
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
};