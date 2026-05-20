const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('./middleware');
const admin = require('../../admin');

router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const { page, limit, role, search } = req.query;
    const result = await admin.listUsers({ page: parseInt(page) || 1, limit: parseInt(limit) || 20, role, search });
    res.json(result);
  } catch (err) {
    console.error('[Admin] List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const user = await admin.getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[Admin] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.put('/users/:id/role', adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const result = await admin.setUserRole(req.params.id, role);
    res.json(result);
  } catch (err) {
    console.error('[Admin] Set role error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    await admin.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
