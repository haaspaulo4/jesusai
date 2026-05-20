const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('./middleware');
const blueprintsModule = require('../../blueprints');

router.get('/blueprints', adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.category) filters.category = req.query.category;
    if (req.query.niche) filters.niche = req.query.niche;
    if (req.query.search) filters.search = req.query.search;
    if (req.query.is_official !== undefined) filters.is_official = req.query.is_official === 'true';
    if (req.query.is_active !== undefined) filters.is_active = req.query.is_active === 'true';
    if (req.query.limit) filters.limit = parseInt(req.query.limit);
    const blueprints = await blueprintsModule.listBlueprints(filters);
    res.json({ blueprints, total: blueprints.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/stats', adminMiddleware, async (req, res) => {
  try {
    const stats = await blueprintsModule.getBlueprintStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/categories', adminMiddleware, async (req, res) => {
  try {
    const categories = await blueprintsModule.getBlueprintCategories();
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/niches', adminMiddleware, async (req, res) => {
  try {
    const niches = await blueprintsModule.getBlueprintNiches(req.query.category || null);
    res.json({ niches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/blueprints/:id', adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(blueprint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/blueprints', adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.createBlueprint(req.body);
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/blueprints/:id', adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.updateBlueprint(req.params.id, req.body);
    if (!blueprint) return res.status(404).json({ error: 'Blueprint not found' });
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/blueprints/:id', adminMiddleware, async (req, res) => {
  try {
    const result = await blueprintsModule.deleteBlueprint(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/:id/clone', adminMiddleware, async (req, res) => {
  try {
    const { overrides } = req.body;
    const persona = await blueprintsModule.cloneBlueprint(req.params.id, overrides || {});
    res.json({ success: true, persona });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/:id/apply/:personaId', adminMiddleware, async (req, res) => {
  try {
    const persona = await blueprintsModule.cloneBlueprintToExisting(req.params.id, req.params.personaId);
    res.json({ success: true, persona });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/blueprints/from-persona/:personaId', adminMiddleware, async (req, res) => {
  try {
    const blueprint = await blueprintsModule.savePersonaAsBlueprint(req.params.personaId, req.body);
    res.json(blueprint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
