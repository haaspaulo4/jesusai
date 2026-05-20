const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const eventsModule = require('../../events');

router.get('/events/log', adminMiddleware, async (req, res) => {
  try {
    const { limit, offset } = paginated(req, 1000);
    const filters = {};
    if (req.query.event_type) filters.event_type = req.query.event_type;
    if (req.query.user_id) filters.user_id = req.query.user_id;
    if (req.query.persona_id) filters.persona_id = req.query.persona_id;
    filters.limit = limit + offset;
    const events = await eventsModule.getEventLog(filters);
    res.json({ events: events.slice(offset), total: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/events/stats', adminMiddleware, async (req, res) => {
  try {
    const stats = await eventsModule.getEventStats(parseInt(req.query.days) || 7);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
