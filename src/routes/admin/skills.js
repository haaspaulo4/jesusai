const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const skillsModule = require('../../skills');

router.get('/skills', adminMiddleware, async (req, res) => {
  try {
    const filters = {};
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    const { limit, offset } = paginated(req, 200);
    const skills = await skillsModule.listSkills(filters);
    res.json({ skills: skills.slice(offset, offset + limit), total: skills.length, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skills', adminMiddleware, async (req, res) => {
  try {
    const skill = await skillsModule.createSkill(req.body);
    res.json(skill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/skills/:id', adminMiddleware, async (req, res) => {
  try {
    const skill = await skillsModule.updateSkill(req.params.id, req.body);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });
    res.json(skill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/skills/:id', adminMiddleware, async (req, res) => {
  try {
    await skillsModule.deleteSkill(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skills/:id/invoke', adminMiddleware, async (req, res) => {
  try {
    const result = await skillsModule.invokeSkill(req.params.id, req.body.input || '', req.body.context || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
