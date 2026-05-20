const { pool } = require('../db');
const { setSetting } = require('../settings');

const WIZARD_STEPS = ['brand', 'persona', 'products', 'whatsapp', 'finish'];

async function getWizardState(userId) {
  const [rows] = await pool.execute('SELECT setting_value FROM settings WHERE setting_key = ?', [`wizard_${userId}`]);
  if (rows.length > 0) {
    try { return JSON.parse(rows[0].setting_value); } catch { return null; }
  }
  return null;
}

async function saveWizardStep(userId, step, data) {
  const existing = await getWizardState(userId) || { currentStep: 0, completed: [], data: {} };
  const stepIndex = WIZARD_STEPS.indexOf(step);
  if (stepIndex === -1) return { error: `Step inválido: ${step}` };
  existing.data[step] = data;
  if (!existing.completed.includes(step)) existing.completed.push(step);
  existing.currentStep = Math.min(stepIndex + 1, WIZARD_STEPS.length - 1);
  await setSetting(`wizard_${userId}`, JSON.stringify(existing));
  return { step, data, nextStep: WIZARD_STEPS[existing.currentStep], completed: existing.completed };
}

async function applyWizard(userId) {
  const state = await getWizardState(userId);
  if (!state || !state.data) return { error: 'Nenhum dado de setup encontrado' };
  const results = {};
  const data = state.data;
  if (data.brand) {
    if (data.brand.name) await setSetting('brand_name', data.brand.name);
    if (data.brand.tagline) await setSetting('brand_tagline', data.brand.tagline);
    if (data.brand.logo_url) await setSetting('brand_logo_url', data.brand.logo_url);
    if (data.brand.primary_color) await setSetting('brand_primary_color', data.brand.primary_color);
    if (data.brand.secondary_color) await setSetting('brand_secondary_color', data.brand.secondary_color);
    if (data.brand.currency) await setSetting('store_currency', data.brand.currency);
    results.brand = 'applied';
  }
  if (data.persona) {
    const [existing] = await pool.execute('SELECT persona_id FROM personas WHERE persona_id = ?', [data.persona.id || 'default']);
    if (existing.length > 0) {
      const fields = [];
      const values = [];
      const personaData = data.persona;
      if (personaData.name) { fields.push('name = ?'); values.push(personaData.name); }
      if (personaData.identity) { fields.push('identity = ?'); values.push(JSON.stringify(personaData.identity)); }
      if (personaData.tts_voice) { fields.push('tts_voice = ?'); values.push(personaData.tts_voice); }
      if (personaData.tts_lang) { fields.push('tts_lang = ?'); values.push(personaData.tts_lang); }
      if (personaData.knowledge_sources) { fields.push('knowledge_sources = ?'); values.push(JSON.stringify(personaData.knowledge_sources)); }
      if (fields.length > 0) {
        values.push(personaData.id || 'default');
        await pool.execute(`UPDATE personas SET ${fields.join(', ')} WHERE persona_id = ?`, values);
      }
    } else {
      const id = data.persona.id || `persona_${Date.now()}`;
      await pool.execute(
        'INSERT INTO personas (persona_id, name, identity, tts_voice, tts_lang, knowledge_sources, is_active, priority) VALUES (?, ?, ?, ?, ?, ?, 1, 10)',
        [id, data.persona.name || 'Assistente', JSON.stringify(data.persona.identity || {}), data.persona.tts_voice || 'pf_dora', data.persona.tts_lang || 'pt-BR', JSON.stringify(data.persona.knowledge_sources || [])]
      );
    }
    results.persona = 'applied';
  }
  if (data.whatsapp) {
    if (data.whatsapp.instance_name) await setSetting('whatsapp_instance', data.whatsapp.instance_name);
    if (data.whatsapp.persona_id) await setSetting('whatsapp_persona_id', data.whatsapp.persona_id);
    if (data.whatsapp.webhook_url) await setSetting('whatsapp_webhook', data.whatsapp.webhook_url);
    results.whatsapp = 'applied';
  }
  await setSetting(`wizard_${userId}`, JSON.stringify({ ...state, applied: true }));
  return { applied: true, results };
}

async function resetWizard(userId) {
  await pool.execute('DELETE FROM settings WHERE setting_key = ?', [`wizard_${userId}`]);
  return { reset: true };
}

module.exports = { getWizardState, saveWizardStep, applyWizard, resetWizard, WIZARD_STEPS };