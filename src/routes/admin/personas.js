const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const admin = require('../../admin');
const metaRag = require('../../persona/meta-rag');
const personaManager = require('../../persona/manager');

router.get('/personas', adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 200);
    const personas = await admin.listPersonas();
    res.json({ personas: personas.slice(offset, offset + limit), total: personas.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List personas error:', err);
    res.status(500).json({ error: 'Failed to list personas' });
  }
});

router.get('/personas/:id', adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.getPersona(req.params.id);
    if (!persona) return res.status(404).json({ error: 'Persona not found' });
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Get persona error:', err);
    res.status(500).json({ error: 'Failed to get persona' });
  }
});

router.post('/personas', adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.createPersona(req.body);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Create persona error:', err);
    res.status(500).json({ error: 'Failed to create persona' });
  }
});

router.put('/personas/:id', adminMiddleware, async (req, res) => {
  try {
    const persona = await admin.updatePersona(req.params.id, req.body);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Update persona error:', err);
    res.status(500).json({ error: 'Failed to update persona' });
  }
});

router.delete('/personas/:id', adminMiddleware, async (req, res) => {
  try {
    await admin.deletePersona(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete persona error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.post('/personas/:id/toggle', adminMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await admin.togglePersona(req.params.id, active !== false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Toggle persona error:', err);
    res.status(500).json({ error: 'Failed to toggle persona' });
  }
});

router.post('/personas/generate', adminMiddleware, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const persona = await metaRag.createPersonaFromDescription(description, req.userId);
    res.json(persona);
  } catch (err) {
    console.error('[Admin] Generate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personas/:id/activate', adminMiddleware, async (req, res) => {
  try {
    await personaManager.togglePersona(req.params.id, true);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Activate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/personas/:id/deactivate', adminMiddleware, async (req, res) => {
  try {
    const { getSetting } = require('../../settings');
    const defaultPersonaId = await getSetting('persona', 'jesus');
    if (req.params.id === 'meta-persona' || req.params.id === defaultPersonaId) return res.status(400).json({ error: 'Cannot deactivate default or meta persona' });
    await personaManager.togglePersona(req.params.id, false);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Deactivate persona error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/personas/:id/business-config', adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../../business');
    const config = await businessModule.getBusinessConfig(req.params.id);
    if (!config) return res.status(404).json({ error: 'Persona not found' });
    res.json({ persona_id: req.params.id, business_config: config });
  } catch (err) {
    console.error('[Admin] Get business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/personas/:id/business-config', adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../../business');
    const updated = await businessModule.updateBusinessConfig(req.params.id, req.body);
    res.json({ persona_id: req.params.id, business_config: updated });
  } catch (err) {
    console.error('[Admin] Update business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/personas/:id/business-config', adminMiddleware, async (req, res) => {
  try {
    const businessModule = require('../../business');
    const defaults = await businessModule.resetBusinessConfig(req.params.id);
    res.json({ persona_id: req.params.id, business_config: defaults, reset: true });
  } catch (err) {
    console.error('[Admin] Reset business config error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
