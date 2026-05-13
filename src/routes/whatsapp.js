const express = require('express');
const { handleWhatsAppMessage, setupWebhook, verifyWebhookSecret, createGroup, addGroupParticipant, removeGroupParticipant, setGroupDescription, leaveGroup } = require('../whatsapp/bot');

const router = express.Router();

router.post('/webhook', async (req, res) => {
  try {
    const data = req.body;

    console.log(`[WhatsApp] RAW BODY:`, JSON.stringify(data).substring(0, 500));

    if (!data) {
      return res.status(200).json({ ok: true });
    }

    // Evolution API v2 can send event at top level or inside data
    const event = data.event || data.data?.event || data.webhookEvent || null;
    const msgData = data.data || data;

    if (!event && !data.key && !data.message) {
      return res.status(200).json({ ok: true });
    }

    console.log(`[WhatsApp] Event: ${event || 'unknown'} | Keys: ${Object.keys(data).join(',')}`);

    if (event === 'MESSAGES_UPSERT' || (data.key && !data.key.fromMe)) {
      const messages = Array.isArray(msgData) ? msgData : [msgData].filter(Boolean);
      if (!Array.isArray(msgData) && data.key) {
        messages.length = 0;
        messages.push(data);
      }
      for (const msg of messages) {
        const key = msg?.key || data?.key;
        const text = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '';
        const fromMe = key?.fromMe;
        const remoteJid = key?.remoteJid || '';
        console.log(`[WhatsApp] Message from=${remoteJid} fromMe=${fromMe} text="${text.substring(0, 80)}"`);
        if (!fromMe) {
          handleWhatsAppMessage({ event: 'MESSAGES_UPSERT', data: msg }).catch(err => {
            console.error('WhatsApp handler error:', err.message, err.stack?.substring(0, 300));
          });
        }
      }
    } else if (event === 'CONNECTION_UPDATE') {
      const state = data.data?.state || data.state;
      console.log(`  WhatsApp connection state: ${state || 'unknown'}`);
    } else if (event === 'CALL') {
      console.log(`  WhatsApp call rejected (from ${data.data?.from || 'unknown'})`);
    } else if (event) {
      console.log(`[WhatsApp] Unhandled event: ${event}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message, err.stack?.substring(0, 200));
    res.status(200).json({ ok: true });
  }
});

router.post('/setup-webhook', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'url is required' });
    }
    const webhookUrl = url.replace(/\/+$/, '') + '/api/whatsapp/webhook';
    await setupWebhook(webhookUrl);
    res.json({ ok: true, webhookUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/group/create', async (req, res) => {
  try {
    const { name, participants } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const result = await createGroup(name, participants || []);
    if (!result) {
      return res.status(500).json({ error: 'Failed to create group' });
    }
    res.json({ ok: true, group: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/group/:groupId/add', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: 'number is required' });
    }
    const result = await addGroupParticipant(groupId, number);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/group/:groupId/remove', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: 'number is required' });
    }
    const result = await removeGroupParticipant(groupId, number);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/group/:groupId/description', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { description } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    const result = await setGroupDescription(groupId, description);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/group/:groupId/leave', async (req, res) => {
  try {
    const { groupId } = req.params;
    const result = await leaveGroup(groupId);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;