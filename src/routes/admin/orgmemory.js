const express = require('express');
const router = express.Router();
const { paginated, premiumMiddleware, resolveOwnerId, checkOwner } = require('./middleware');
const orgMemoryModule = require('../../orgmemory');

router.get('/org-memory', premiumMiddleware, async (req, res) => {
  try {
    const filters = { owner_id: req.userId };
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.search) filters.search = req.query.search;
    const { limit, offset } = paginated(req, 200);
    const memories = await orgMemoryModule.listOrgMemory(filters);
    res.json({ memories: memories.slice(offset, offset + limit), total: memories.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/org-memory', premiumMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.createOrgMemory({ ...req.body, owner_id: await resolveOwnerId(req) });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/search', premiumMiddleware, async (req, res) => {
  try {
    const results = await orgMemoryModule.searchOrgMemory(req.query.q || '', req.userId, req.query.persona_id, 10);
    res.json({ results, total: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/org-memory/:id', premiumMiddleware, async (req, res) => {
  try {
    const mem = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!mem) return res.status(404).json({ error: 'Memory not found' });
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/org-memory/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to modify this memory' });
    const mem = await orgMemoryModule.updateOrgMemory(req.params.id, req.body);
    res.json(mem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/org-memory/:id', premiumMiddleware, async (req, res) => {
  try {
    const existing = await orgMemoryModule.getOrgMemory(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Memory not found' });
    if (!checkOwner(existing.owner_id, req.userId, req.userRole)) return res.status(403).json({ error: 'Not authorized to delete this memory' });
    await orgMemoryModule.deleteOrgMemory(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
