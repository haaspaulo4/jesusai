const express = require('express');
const router = express.Router();
const { paginated, adminMiddleware } = require('./middleware');
const botManager = require('../../bot/manager');

router.get('/bots', adminMiddleware, async (req, res) => {
  try {
    const { platform } = req.query;
    const { limit, offset } = paginated(req, 200);
    const bots = await botManager.listBots(platform);
    const active = botManager.getActiveBots();
    const enriched = bots.map(b => ({
      ...b,
      running: active.some(a => a.id === b.id),
    }));
    res.json({ bots: enriched.slice(offset, offset + limit), total: enriched.length, limit, offset });
  } catch (err) {
    console.error('[Admin] List bots error:', err);
    res.status(500).json({ error: 'Failed to list bots' });
  }
});

router.get('/bots/active', adminMiddleware, async (req, res) => {
  try {
    res.json(botManager.getActiveBots());
  } catch (err) {
    console.error('[Admin] Active bots error:', err);
    res.status(500).json({ error: 'Failed to get active bots' });
  }
});

router.get('/bots/:id', adminMiddleware, async (req, res) => {
  try {
    const bot = await botManager.getBot(parseInt(req.params.id));
    if (!bot) return res.status(404).json({ error: 'Bot not found' });
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Get bot error:', err);
    res.status(500).json({ error: 'Failed to get bot' });
  }
});

router.post('/bots', adminMiddleware, async (req, res) => {
  try {
    const { platform, name, token, webhookUrl, instanceName, personaId, config } = req.body;
    if (!platform || !name) return res.status(400).json({ error: 'platform and name are required' });
    if (!['telegram', 'whatsapp'].includes(platform)) return res.status(400).json({ error: 'platform must be telegram or whatsapp' });
    const bot = await botManager.addBot({ platform, name, token, webhookUrl, instanceName, personaId, config });
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Add bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/bots/:id', adminMiddleware, async (req, res) => {
  try {
    const bot = await botManager.updateBot(parseInt(req.params.id), req.body);
    res.json(bot);
  } catch (err) {
    console.error('[Admin] Update bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/bots/:id', adminMiddleware, async (req, res) => {
  try {
    await botManager.deleteBot(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin] Delete bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/:id/start', adminMiddleware, async (req, res) => {
  try {
    const result = await botManager.startBot(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    console.error('[Admin] Start bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/:id/stop', adminMiddleware, async (req, res) => {
  try {
    await botManager.stopBot(parseInt(req.params.id));
    res.json({ ok: true, status: 'stopped' });
  } catch (err) {
    console.error('[Admin] Stop bot error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bots/start-all', adminMiddleware, async (req, res) => {
  try {
    const results = await botManager.startAllBots();
    res.json(results);
  } catch (err) {
    console.error('[Admin] Start all bots error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
