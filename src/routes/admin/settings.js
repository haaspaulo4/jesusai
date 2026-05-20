const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const admin = require('../../admin');

// ===== Settings =====
router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    const settings = await admin.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('[Admin] Get settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

router.put('/settings', adminMiddleware, async (req, res) => {
  try {
    const ALLOWED_SETTINGS = [
      'brand_name', 'brand_tagline', 'brand_logo_url', 'brand_primary_color', 'brand_secondary_color',
      'onboarding_enabled', 'onboarding_greeting', 'onboarding_greeting_en', 'onboarding_greeting_es',
      'survey_enabled', 'followup_enabled', 'followup_interval_messages', 'ratings_enabled',
      'rate_limit_guest', 'rate_limit_user', 'rate_limit_premium', 'rate_limit_admin',
      'message_chunk_size', 'audio_chunk_size', 'default_persona', 'default_language',
      'welcome_message', 'welcome_message_en', 'welcome_message_es',
      'store_currency', 'store_currency_symbol', 'store_whatsapp', 'store_address', 'store_hero_video', 'store_footer_text',
      'store_instagram_url', 'store_facebook_url', 'store_tiktok_url', 'store_cookie_consent',
      'store_delivery_fee', 'store_free_delivery_above', 'store_delivery_zones', 'commerce_enabled',
      'store_payment_methods', 'store_pix_key', 'store_pix_name', 'store_bank_info',
      'loyalty_enabled', 'loyalty_type', 'loyalty_points_per_real', 'loyalty_cashback_percent', 'loyalty_minimum_redemption',
    ];
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    if (!ALLOWED_SETTINGS.includes(key)) return res.status(400).json({ error: `Setting "${key}" is not allowed. Allowed: ${ALLOWED_SETTINGS.join(', ')}` });
    const result = await admin.setSettings(key, value);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Set settings error:', err);
    res.status(500).json({ error: 'Failed to set setting' });
  }
});

// ===== MCP =====
router.get('/mcp', adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const servers = await admin.listMCPServers();
    const items = Array.isArray(servers) ? servers : [];
    res.json({ servers: items.slice(offset, offset + limit), total: items.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List MCP error:', err);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

router.post('/mcp', adminMiddleware, async (req, res) => {
  try {
    const { name, command, args, env_vars } = req.body;
    if (!name || !command) return res.status(400).json({ error: 'name and command required' });
    const result = await admin.addMCPServer(name, command, args || [], env_vars || {});
    res.json(result);
  } catch (err) {
    console.error('[Admin] Add MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/mcp/:id', adminMiddleware, async (req, res) => {
  try {
    await admin.removeMCPServer(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Remove MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/mcp/:id/connect', adminMiddleware, async (req, res) => {
  try {
    const result = await admin.connectMCPServer(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Connect MCP error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===== Onboarding =====
router.get('/onboarding/steps', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const { persona_id } = req.query;
    const steps = await onboarding.getOnboardingSteps(persona_id || null);
    res.json({ steps });
  } catch (err) {
    console.error('[Admin] Get onboarding steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/steps', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const result = await onboarding.createOnboardingStep(req.body);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Create onboarding step error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/onboarding/steps/:stepKey', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const result = await onboarding.deleteOnboardingStep(req.params.stepKey);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Delete onboarding step error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/reset', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const { persona_id } = req.body;
    const result = await onboarding.resetOnboardingSteps(persona_id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Reset onboarding steps error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/onboarding/status/:userId', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const { persona_id } = req.query;
    const status = await onboarding.getUserOnboardingStatus(req.params.userId, persona_id || null);
    res.json(status);
  } catch (err) {
    console.error('[Admin] Get onboarding status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding/reset-user/:userId', adminMiddleware, async (req, res) => {
  try {
    const onboarding = require('../../onboarding');
    const { persona_id } = req.body;
    const result = await onboarding.resetUserOnboarding(req.params.userId, persona_id);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Reset user onboarding error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
