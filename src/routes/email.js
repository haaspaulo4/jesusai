const express = require('express');
const {
  subscribe,
  confirmSubscription,
  unsubscribe,
  saveContactMessage,
  sendContactNotification,
  sendContactReply,
  sendDailyDevotional,
} = require('../email');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.post('/subscribe', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email válido é obrigatório' });
    }

    const result = await subscribe(email.trim().toLowerCase(), (name || '').trim());
    res.json(result);
  } catch (err) {
    console.error('[Email] Subscribe error:', err.message);
    res.status(500).json({ error: 'Erro ao processar inscrição' });
  }
});

router.get('/confirm/:token', async (req, res) => {
  try {
    const result = await confirmSubscription(req.params.token);

    if (result.status === 'confirmed') {
      res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px;">
<span style="font-size:4rem;display:block;color:#c9a227;">✝</span>
<h1 style="color:#c9a227;font-size:1.5rem;margin:15px 0;">Inscrição confirmada!</h1>
<p style="color:#8888a0;font-size:0.95rem;line-height:1.6;">Você receberá o devocional diário baseado nas Escrituras.</p>
<a href="${process.env.APP_URL || 'http://localhost:3000'}" style="display:inline-block;background:#c9a227;color:#0f0f1a;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Voltar para Jesus.AI</a>
</div>
</body>
</html>`);
    } else {
      res.status(400).send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:sans-serif;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px;">
<h1 style="color:#e74c3c;">Link inválido</h1>
<p style="color:#8888a0;">Este link de confirmação expirou ou já foi usado.</p>
<a href="${process.env.APP_URL || 'http://localhost:3000'}" style="color:#c9a227;">Voltar</a>
</div>
</body>
</html>`);
    }
  } catch (err) {
    console.error('[Email] Confirm error:', err.message);
    res.status(500).send('Erro ao confirmar inscrição.');
  }
});

router.get('/unsubscribe/:token', async (req, res) => {
  try {
    const result = await unsubscribe(req.params.token);

    if (result.status === 'unsubscribed') {
      res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px;">
<span style="font-size:4rem;display:block;color:#c9a227;">✝</span>
<h1 style="color:#e8e8e8;font-size:1.3rem;margin:15px 0;">Inscrição cancelada</h1>
<p style="color:#8888a0;font-size:0.9rem;line-height:1.6;">Você não receberá mais emails do Jesus.AI.<br>Que a paz de Deus esteja com você.</p>
<a href="${process.env.APP_URL || 'http://localhost:3000'}" style="display:inline-block;background:#c9a227;color:#0f0f1a;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Voltar para Jesus.AI</a>
</div>
</body>
</html>`);
    } else {
      res.status(400).send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:sans-serif;color:#e8e8e8;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px;">
<h1 style="color:#e74c3c;">Link inválido</h1>
<p style="color:#8888a0;">Este link de cancelamento expirou ou já foi usado.</p>
</div>
</body>
</html>`);
    }
  } catch (err) {
    console.error('[Email] Unsubscribe error:', err.message);
    res.status(500).send('Erro ao cancelar inscrição.');
  }
});

router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Email válido é obrigatório' });
    }
    if (!message || message.trim().length < 3) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const userId = req.userId || null;
    await saveContactMessage((name || '').trim(), email.trim().toLowerCase(), (subject || '').trim(), message.trim().substring(0, 5000), userId);

    sendContactNotification((name || '').trim(), email.trim().toLowerCase(), subject || 'Contato', message.trim().substring(0, 5000)).catch(err => {
      console.error('[Email] Contact notification error:', err.message);
    });

    sendContactReply(email.trim().toLowerCase(), (name || '').trim()).catch(err => {
      console.error('[Email] Contact reply error:', err.message);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[Email] Contact error:', err.message);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

router.post('/daily-devotional', authMiddleware, async (req, res) => {
  try {
    await sendDailyDevotional();
    res.json({ ok: true, message: 'Devocional enviado para todos os inscritos confirmados.' });
  } catch (err) {
    console.error('[Email] Daily devotional error:', err.message);
    res.status(500).json({ error: 'Erro ao enviar devocional' });
  }
});

module.exports = router;