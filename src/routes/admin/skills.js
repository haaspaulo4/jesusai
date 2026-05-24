const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const skillsModule = require('../../skills');
const { executeOpenCodeTask, invokeSkillOpenCode } = require('../../skills/opencode');

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
    const skill = await skillsModule.getSkill(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found' });

    if (skill.type === 'opencode' || skill.type === 'task') {
      const result = await invokeSkillOpenCode(req.params.id, req.body.input || '', req.body.context || {});
      res.json(result);
    } else {
      const result = await skillsModule.invokeSkill(req.params.id, req.body.input || '', req.body.context || {});
      res.json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/opencode', adminMiddleware, async (req, res) => {
  try {
    const { task, working_dir, timeout_seconds } = req.body;
    if (!task || task.trim().length < 5) {
      return res.status(400).json({ error: 'Task description required (min 5 characters)' });
    }
    const result = await executeOpenCodeTask(task, {
      workingDir: working_dir,
      timeout: Math.min(parseInt(timeout_seconds) || 120, 300) * 1000,
      personaId: req.body.persona_id,
      userId: req.userId,
      sessionId: req.body.session_id,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
