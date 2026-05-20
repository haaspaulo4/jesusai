const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const admin = require('../../admin');

router.get('/integrations', adminMiddleware, async (req, res) => {
  try {
    const { service } = req.query;
    const { limit, offset } = paginated(req, 200);
    const result = await admin.listIntegrations(service);
    const items = Array.isArray(result) ? result : (result.integrations || result.data || []);
    res.json({ integrations: items.slice(offset, offset + limit), total: items.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List integrations error:', err);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

router.post('/integrations', adminMiddleware, async (req, res) => {
  try {
    const { service_type, api_key, base_url, model, label, priority, extra_config } = req.body;
    if (!service_type) return res.status(400).json({ error: 'service_type is required' });

    const result = await admin.addIntegration(service_type, api_key || '', {
      baseUrl: base_url,
      model,
      label,
      priority: priority || 100,
      extraConfig: extra_config,
    });
    res.json(result);
  } catch (err) {
    console.error('[Admin] Add integration error:', err);
    res.status(500).json({ error: 'Failed to add integration' });
  }
});

router.delete('/integrations/:id', adminMiddleware, async (req, res) => {
  try {
    await admin.removeIntegration(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Remove integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/integrations/:id/toggle', adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await admin.toggleIntegration(parseInt(req.params.id), active !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Toggle integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/integrations/:id', adminMiddleware, async (req, res) => {
  try {
    const result = await admin.updateIntegration(parseInt(req.params.id), req.body);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Update integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/integrations/:id/test', adminMiddleware, async (req, res) => {
  try {
    const result = await admin.testIntegration(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Test integration error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
