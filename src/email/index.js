const nodemailer = require('nodemailer');
const { pool } = require('../db');
const { getAllPosts, generatePost } = require('../blog');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '"Jesus.AI" <noreply@jesus.ai>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

let transporter = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

async function sendMail(to, subject, html, text) {
  const transport = getTransporter();
  if (!transport) {
    console.log('[Email] SMTP not configured. Would send to:', to, subject);
    return null;
  }

  try {
    const result = await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    return result;
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    throw err;
  }
}

function devotionalTemplate(post, unsubToken, email) {
  const unsubUrl = `${APP_URL}/api/email/unsubscribe/${unsubToken}`;
  return {
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#1a1a2e;border-radius:16px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:30px 40px;text-align:center;border-bottom:2px solid #c9a227;">
<span style="font-size:2.5rem;display:block;color:#c9a227;">✝</span>
<h1 style="color:#c9a227;margin:10px 0 5px;font-size:1.5rem;">Jesus.AI</h1>
<p style="color:#8888a0;margin:0;font-size:0.85rem;">Palavra do Dia</p>
</td></tr>
<tr><td style="padding:30px 40px;">
<h2 style="color:#c9a227;font-size:1.3rem;margin-bottom:5px;">${escapeHtml(post.title)}</h2>
<p style="color:#c9a227;font-style:italic;font-size:0.9rem;margin-bottom:20px;">${escapeHtml(post.verse)}</p>
<div style="font-size:0.95rem;line-height:1.8;color:#e8e8e8;white-space:pre-line;">${escapeHtml(post.content.substring(0, 1500))}${post.content.length > 1500 ? '...' : ''}</div>
<div style="margin-top:25px;text-align:center;">
<a href="${APP_URL}/blog/posts/${post.slug}" style="display:inline-block;background:#c9a227;color:#0f0f1a;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem;">Ler devocional completo</a>
</div>
</td></tr>
<tr><td style="padding:20px 40px;text-align:center;border-top:1px solid #2a2a4a;">
<p style="font-size:0.75rem;color:#8888a0;margin:0 0 5px;">Toda glória a Jesus. Este projeto não substitui a busca pela Palavra, pela comunidade de fé, pela igreja ou pelo acompanhamento pastoral.</p>
<a href="${unsubUrl}" style="font-size:0.72rem;color:#8888a0;">Cancelar inscrição</a>
</td></tr>
</table>
</body>
</html>`,
    text: `${post.title}\n${post.verse}\n\n${post.content.substring(0, 800)}...\n\nLer mais: ${APP_URL}/blog/posts/${post.slug}\n\n---\nCancelar inscrição: ${unsubUrl}`,
  };
}

function confirmTemplate(name, confirmUrl) {
  return {
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:0 auto;background:#1a1a2e;border-radius:16px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:30px 40px;text-align:center;border-bottom:2px solid #c9a227;">
<span style="font-size:2.5rem;display:block;color:#c9a227;">✝</span>
<h1 style="color:#c9a227;margin:10px 0;font-size:1.5rem;">Jesus.AI</h1>
</td></tr>
<tr><td style="padding:30px 40px;text-align:center;">
<h2 style="color:#e8e8e8;font-size:1.2rem;margin-bottom:15px;">Confirme sua inscrição${name ? ', ' + escapeHtml(name) : ''}!</h2>
<p style="color:#8888a0;font-size:0.9rem;line-height:1.6;margin-bottom:25px;">Você receberá o devocional diário baseado nas Escrituras, direto no seu email.</p>
<a href="${confirmUrl}" style="display:inline-block;background:#c9a227;color:#0f0f1a;padding:14px 35px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1rem;">Confirmar inscrição</a>
<p style="font-size:0.75rem;color:#8888a0;margin-top:25px;">Se você não se inscreveu, simplesmente ignore este email.</p>
</td></tr>
</table>
</body>
</html>`,
    text: `Confirme sua inscrição no Jesus.AI!\n\nAcesse o link para confirmar: ${confirmUrl}\n\nSe você não se inscreveu, ignore este email.`,
  };
}

function contactReplyTemplate(name) {
  return {
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:'Segoe UI',system-ui,sans-serif;color:#e8e8e8;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;margin:0 auto;background:#1a1a2e;border-radius:16px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:30px 40px;text-align:center;border-bottom:2px solid #c9a227;">
<span style="font-size:2.5rem;display:block;color:#c9a227;">✝</span>
<h1 style="color:#c9a227;margin:10px 0;font-size:1.5rem;">Jesus.AI</h1>
</td></tr>
<tr><td style="padding:30px 40px;text-align:center;">
<h2 style="color:#e8e8e8;font-size:1.1rem;margin-bottom:15px;">Recebemos sua mensagem${name ? ', ' + escapeHtml(name) : ''}!</h2>
<p style="color:#8888a0;font-size:0.9rem;line-height:1.6;">Obrigado por entrar em contato. Vamos ler sua mensagem com atenção e responder o mais breve possível.</p>
<p style="color:#c9a227;font-style:italic;font-size:0.85rem;margin-top:20px;">"O Senhor é o meu pastor; nada me faltará." — Salmos 23:1</p>
</td></tr>
</table>
</body>
</html>`,
    text: `Recebemos sua mensagem${name ? ', ' + name : ''}!\n\nObrigado por entrar em contato. Vamos responder o mais breve possível.\n\n"O Senhor é o meu pastor; nada me faltará." — Salmos 23:1`,
  };
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function subscribe(email, name = '') {
  const [rows] = await pool.execute('SELECT id, confirmed FROM newsletter_subscribers WHERE email = ?', [email]);
  if (rows.length > 0) {
    if (rows[0].confirmed) {
      return { status: 'already_subscribed' };
    }
    const confirmToken = rows[0].confirm_token || require('crypto').randomBytes(32).toString('hex');
    await pool.execute('UPDATE newsletter_subscribers SET confirm_token = ?, name = ? WHERE email = ?', [confirmToken, name, email]);
    const confirmUrl = `${APP_URL}/api/email/confirm/${confirmToken}`;
    const tmpl = confirmTemplate(name, confirmUrl);
    await sendMail(email, 'Confirme sua inscrição — Jesus.AI', tmpl.html, tmpl.text);
    return { status: 'confirmation_resent' };
  }

  const crypto = require('crypto');
  const confirmToken = crypto.randomBytes(32).toString('hex');
  const unsubToken = crypto.randomBytes(32).toString('hex');

  await pool.execute(
    'INSERT INTO newsletter_subscribers (email, name, confirm_token, unsub_token) VALUES (?, ?, ?, ?)',
    [email, name, confirmToken, unsubToken]
  );

  const confirmUrl = `${APP_URL}/api/email/confirm/${confirmToken}`;
  const tmpl = confirmTemplate(name, confirmUrl);
  await sendMail(email, 'Confirme sua inscrição — Jesus.AI', tmpl.html, tmpl.text);

  return { status: 'confirmation_sent' };
}

async function confirmSubscription(token) {
  const [rows] = await pool.execute('SELECT id, email FROM newsletter_subscribers WHERE confirm_token = ?', [token]);
  if (rows.length === 0) return { status: 'invalid_token' };

  await pool.execute('UPDATE newsletter_subscribers SET confirmed = 1, confirm_token = NULL WHERE id = ?', [rows[0].id]);
  return { status: 'confirmed', email: rows[0].email };
}

async function unsubscribe(token) {
  const [rows] = await pool.execute('SELECT id FROM newsletter_subscribers WHERE unsub_token = ?', [token]);
  if (rows.length === 0) return { status: 'invalid_token' };

  await pool.execute('DELETE FROM newsletter_subscribers WHERE id = ?', [rows[0].id]);
  return { status: 'unsubscribed' };
}

async function saveContactMessage(name, email, subject, message, userId = null) {
  const [result] = await pool.execute(
    'INSERT INTO contact_messages (name, email, subject, message, user_id) VALUES (?, ?, ?, ?, ?)',
    [name, email, subject, message, userId]
  );
  return result.insertId;
}

async function sendContactNotification(name, email, subject, message) {
  const tmpl = {
    html: `<h3>Novo contato via Jesus.AI</h3><p><strong>Nome:</strong> ${escapeHtml(name || 'Anônimo')}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>Assunto:</strong> ${escapeHtml(subject)}</p><p><strong>Mensagem:</strong></p><p>${escapeHtml(message)}</p>`,
    text: `Novo contato via Jesus.AI\nNome: ${name || 'Anônimo'}\nEmail: ${email}\nAssunto: ${subject}\nMensagem: ${message}`,
  };
  await sendMail(SMTP_USER, `[Jesus.AI] Contato: ${subject}`, tmpl.html, tmpl.text);
}

async function sendContactReply(email, name) {
  const tmpl = contactReplyTemplate(name);
  await sendMail(email, 'Recebemos sua mensagem — Jesus.AI', tmpl.html, tmpl.text);
}

async function sendDailyDevotional() {
  const [subscribers] = await pool.execute('SELECT email, name, unsub_token FROM newsletter_subscribers WHERE confirmed = 1');
  if (subscribers.length === 0) {
    console.log('[Email] No confirmed subscribers. Skipping daily devotional.');
    return;
  }

  const today = new Date();
  const todaySlug = `palavra-${today.toISOString().split('T')[0]}`;
  let post;

  try {
    const { getPost } = require('../blog');
    post = await getPost(todaySlug);
    if (!post) {
      const { generatePost } = require('../blog');
      post = await generatePost(today);
    }
  } catch (err) {
    console.error('[Email] Failed to get/generate daily post:', err.message);
    return;
  }

  if (!post) return;

  let sent = 0;
  for (const sub of subscribers) {
    try {
      const tmpl = devotionalTemplate(post, sub.unsub_token, sub.email);
      await sendMail(sub.email, `🕊 Palavra do Dia: ${post.title}`, tmpl.html, tmpl.text);
      sent++;
    } catch (err) {
      console.error(`[Email] Failed to send to ${sub.email}:`, err.message);
    }
  }

  console.log(`[Email] Daily devotional sent to ${sent}/${subscribers.length} subscribers.`);
}

function scheduleDailyDevotional() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 5, 0, 0);

  const msUntil5am = tomorrow - now;

  setTimeout(async () => {
    await sendDailyDevotional();
    setInterval(sendDailyDevotional, 24 * 60 * 60 * 1000);
  }, msUntil5am);

  console.log(`[Email] Daily devotional scheduled for ${tomorrow.toLocaleString('pt-BR')}`);
}

module.exports = {
  sendMail,
  subscribe,
  confirmSubscription,
  unsubscribe,
  saveContactMessage,
  sendContactNotification,
  sendContactReply,
  sendDailyDevotional,
  scheduleDailyDevotional,
  getTransporter,
};