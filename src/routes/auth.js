const express = require('express');
const { generateToken, generateRefreshToken, authMiddleware, getUser, updateUser, getUserWithRole, findOrCreateFromGoogle, generateLinkCode, linkAccount, findLinkedUser, pool, verifyToken, safeUser } = require('../auth');
const { register, login } = require('../auth/index');
const bcrypt = require('bcryptjs');
const { validate, registerSchema, loginSchema, googleAuthSchema } = require('../validation');

const router = express.Router();

router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const user = await register(email, password, name);
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({ user: { id: user.id, email: user.email, name: user.name, role: 'user' }, token, refreshToken });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const { id, email: userEmail, name } = await login(email, password);
    const fullUser = await getUserWithRole(id);
    const token = generateToken(fullUser);
    const refreshToken = generateRefreshToken(fullUser);

    res.json({ user: { id: fullUser.id, email: fullUser.email, name: fullUser.name, role: fullUser.role, avatar: fullUser.avatar }, token, refreshToken });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/google', validate(googleAuthSchema), async (req, res) => {
  try {
    const { idToken, email, name, googleId, avatar } = req.body;

    let verifiedEmail = email;
    let verifiedGoogleId = googleId;
    if (process.env.GOOGLE_CLIENT_ID) {
      try {
        const https = require('https');
        const tokenInfo = await new Promise((resolve, reject) => {
          https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
          }).on('error', reject);
        });
        if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
          return res.status(401).json({ error: 'Token inválido' });
        }
        if (tokenInfo.email !== email) {
          return res.status(401).json({ error: 'Email não confere com o token' });
        }
        if (tokenInfo.sub !== googleId) {
          return res.status(401).json({ error: 'Google ID não confere com o token' });
        }
        verifiedEmail = tokenInfo.email;
        verifiedGoogleId = tokenInfo.sub;
      } catch (verifyErr) {
        console.error('[Auth] Google token verification failed:', verifyErr.message);
        return res.status(401).json({ error: 'Falha na verificação do token Google' });
      }
    }

    const user = await findOrCreateFromGoogle({
      email: verifiedEmail,
      name: name || verifiedEmail.split('@')[0],
      googleId: verifiedGoogleId,
      avatar: avatar || null,
    });

    const fullUser = await getUserWithRole(user.id);
    const token = generateToken(fullUser);
    const refreshToken = generateRefreshToken(fullUser);

    res.json({
      user: { id: fullUser.id, email: fullUser.email, name: fullUser.name, role: fullUser.role, avatar: fullUser.avatar },
      token,
      refreshToken,
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Erro no login com Google' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token obrigatório' });
    }
    const decoded = verifyToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }
    const [rows] = await pool.execute('SELECT id, email, role, token_version FROM users WHERE id = ?', [decoded.id]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    const user = rows[0];
    if (user.role === 'banned') {
      return res.status(403).json({ error: 'Conta suspensa' });
    }
    if (decoded.tv !== undefined && decoded.tv !== user.token_version) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    const fullUser = await getUserWithRole(user.id);
    const newToken = generateToken(fullUser);
    const newRefreshToken = generateRefreshToken(fullUser);
    res.json({ token: newToken, refreshToken: newRefreshToken, user: { id: fullUser.id, email: fullUser.email, name: fullUser.name, role: fullUser.role } });
  } catch (err) {
    res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await getUserWithRole(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json(safeUser(user));
});

router.put('/me', authMiddleware, async (req, res) => {
  const { name } = req.body;
  const updated = await updateUser(req.userId, { name });
  if (!updated) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  res.json(safeUser(updated));
});

router.post('/link-code', authMiddleware, async (req, res) => {
  try {
    const result = await generateLinkCode(req.userId);
    res.json({ code: result.code, expires: result.expires });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/link-status', authMiddleware, async (req, res) => {
  try {
    const user = await getUserWithRole(req.userId);
    res.json({
      whatsappLinked: !!user.whatsappId,
      telegramLinked: !!user.telegramId,
      whatsappId: user.whatsappId || null,
      telegramId: user.telegramId || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/link', async (req, res) => {
  try {
    const { code, botUserId, source } = req.body;
    if (!code || !botUserId) {
      return res.status(400).json({ error: 'Código e botUserId são obrigatórios' });
    }
    if (!['whatsapp', 'telegram'].includes(source)) {
      return res.status(400).json({ error: 'Source deve ser whatsapp ou telegram' });
    }
    const result = await linkAccount(code, botUserId, source);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/unlink', authMiddleware, async (req, res) => {
  try {
    const { source } = req.body;
    if (!['whatsapp', 'telegram'].includes(source)) {
      return res.status(400).json({ error: 'Source deve ser whatsapp ou telegram' });
    }
    const col = source === 'whatsapp' ? 'whatsapp_id' : 'telegram_id';
    await pool.execute(`UPDATE users SET ${col} = NULL WHERE id = ?`, [req.userId]);
    res.json({ success: true, unlinked: source });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve ter mínimo 8 caracteres, 1 maiúscula, 1 número e 1 caractere especial' });
    }
    const user = await getUserWithRole(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hashed, req.userId]);
    const updatedUser = await getUserWithRole(req.userId);
    const newToken = generateToken(updatedUser);
    const newRefresh = generateRefreshToken(updatedUser);
    res.json({ success: true, message: 'Senha alterada com sucesso', token: newToken, refreshToken: newRefresh });
  } catch (err) {
    console.error('[Auth] Change password error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/consent', authMiddleware, async (req, res) => {
  try {
    const { data_processing, cookie_consent } = req.body;
    const updates = [];
    const values = [];

    if (typeof data_processing === 'number') {
      updates.push('data_processing_consent = ?');
      values.push(data_processing ? 1 : 0);
    }
    if (cookie_consent && ['all', 'necessary', 'custom'].includes(cookie_consent)) {
      updates.push('cookie_consent = ?');
      values.push(cookie_consent);
      updates.push('cookie_consent_date = NOW()');
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum consentimento válido fornecido' });
    }

    updates.push('consent_date = NOW()');
    updates.push("consent_version = '1.0'");
    values.push(req.userId);

    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true, message: 'Consentimento registrado' });
  } catch (err) {
    console.error('[Auth] Consent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/data-export', authMiddleware, async (req, res) => {
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    const user = { ...users[0] };
    delete user.password;
    delete user.ollama_api_key;
    delete user.link_code;
    delete user.link_code_expires;
    delete user.token_version;

    const [profiles] = await pool.execute('SELECT * FROM profiles WHERE id = ?', [req.userId]);
    const [sessions] = await pool.execute('SELECT id, user_name, persona_id, created_at, last_activity FROM sessions WHERE user_id = ?', [req.userId]);
    const [xp] = await pool.execute('SELECT * FROM user_xp WHERE user_id = ?', [req.userId]);
    const [progress] = await pool.execute('SELECT * FROM user_progress WHERE user_id = ?', [req.userId]);
    const [goals] = await pool.execute('SELECT * FROM persona_goals WHERE owner_id = ?', [req.userId]);
    const [tasks] = await pool.execute('SELECT * FROM persona_tasks WHERE owner_id = ?', [req.userId]);
    const [contacts] = await pool.execute('SELECT * FROM persona_contacts WHERE owner_id = ?', [req.userId]);
    const [onboarding] = await pool.execute('SELECT * FROM user_onboarding WHERE user_id = ?', [req.userId]);
    const [ratings] = await pool.execute('SELECT * FROM ratings WHERE user_id = ?', [req.userId]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user,
      profile: profiles[0] || null,
      sessions,
      xp,
      progress,
      goals,
      tasks,
      contacts,
      onboarding,
      ratings,
    };

    res.setHeader('Content-Disposition', 'attachment; filename="metapersona_data_export.json"');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    console.error('[Auth] Data export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/data-delete', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const [users] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    const userEmail = users[0].email;

    await pool.execute('DELETE FROM persona_messages WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_xp WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_progress WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_onboarding WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM ratings WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM follow_ups WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_tasks WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_goals WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_contacts WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_calendar WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_automations WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM persona_org_memory WHERE owner_id = ?', [userId]);
    await pool.execute('DELETE FROM cognitive_states WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM human_overrides WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM agent_thoughts WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM rate_limits WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM login_attempts WHERE email = ?', [userEmail]);
    await pool.execute('DELETE FROM profiles WHERE id = ?', [userId]);

    const [sessions] = await pool.execute('SELECT id FROM sessions WHERE user_id = ?', [userId]);
    for (const s of sessions) {
      await pool.execute('DELETE FROM messages WHERE session_id = ?', [s.id]);
    }
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ success: true, message: 'Todos os dados foram excluídos permanentemente' });
  } catch (err) {
    console.error('[Auth] Data delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/consent/revoke', authMiddleware, async (req, res) => {
  try {
    await pool.execute('UPDATE users SET data_processing_consent = 0, consent_date = NULL WHERE id = ?', [req.userId]);
    res.json({ success: true, message: 'Consentimento revogado. Seus dados serão processados apenas para cumprimento de obrigação legal.' });
  } catch (err) {
    console.error('[Auth] Revoke consent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Calendar OAuth ───
const googleCalendar = require('../google/calendar');

router.get('/google/calendar', authMiddleware, async (req, res) => {
  try {
    const url = await googleCalendar.getAuthUrl(req.userId);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Authorization code required' });

    const result = await googleCalendar.handleCallback(code);

    let userId = result.userId;
    if (state) {
      try { userId = JSON.parse(Buffer.from(state, 'base64').toString()).userId; } catch {}
    }
    if (!userId) return res.status(400).json({ error: 'User identification failed' });

    await googleCalendar.saveUserTokens(userId, result.tokens);

    await pool.execute('UPDATE users SET google_calendar_sync = 1 WHERE id = ?', [userId]);

    const html = `<!DOCTYPE html><html><head><script>window.opener?.postMessage({type:'google_calendar_connected'},'*');window.close();</script></head><body><h3>Google Calendar conectado!</h3><p>Você pode fechar esta janela.</p></body></html>`;
    res.send(html);
  } catch (err) {
    console.error('[Auth] Google Calendar callback error:', err.message);
    res.status(500).send('<h3>Erro ao conectar Google Calendar.</h3><p>' + err.message + '</p>');
  }
});

router.get('/google/status', authMiddleware, async (req, res) => {
  try {
    const connected = await googleCalendar.isGoogleCalendarConnected(req.userId);
    res.json({ connected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/google/calendar', authMiddleware, async (req, res) => {
  try {
    await googleCalendar.disconnectGoogleCalendar(req.userId);
    res.json({ success: true, message: 'Google Calendar desconectado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Google Calendar Events ───
router.get('/google/calendars', authMiddleware, async (req, res) => {
  try {
    const calendars = await googleCalendar.listCalendars(req.userId);
    res.json({ calendars });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/google/events', authMiddleware, async (req, res) => {
  try {
    const { calendarId, timeMin, timeMax, maxResults } = req.query;
    const events = await googleCalendar.listEvents(req.userId, calendarId || 'primary', {
      timeMin, timeMax, maxResults: parseInt(maxResults) || 50,
    });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/google/events', authMiddleware, async (req, res) => {
  try {
    const { calendarId, ...eventData } = req.body;
    const event = await googleCalendar.createEvent(req.userId, eventData, calendarId || 'primary');
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/google/events/:eventId', authMiddleware, async (req, res) => {
  try {
    const { calendarId } = req.query;
    await googleCalendar.deleteEvent(req.userId, req.params.eventId, calendarId || 'primary');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Scheduling Public Routes ───
const scheduling = require('../services/scheduling');

router.get('/scheduling/services/:personaId', async (req, res) => {
  try {
    const services = await scheduling.getServiceTypes(req.params.personaId);
    res.json({ services });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/scheduling/slots/:personaId', async (req, res) => {
  try {
    const { date, serviceTypeId } = req.query;
    if (!date) return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
    const slots = await scheduling.availableSlots(req.params.personaId, serviceTypeId, date);
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/scheduling/book/:personaId', async (req, res) => {
  try {
    const { serviceTypeId, startTime, customerName, customerPhone, customerEmail, notes } = req.body;
    if (!startTime) return res.status(400).json({ error: 'startTime required' });

    const ownerId = req.userId || req.body.ownerId || null;
    const appointment = await scheduling.bookSlot(req.params.personaId, serviceTypeId, startTime, {
      customerName: customerName || '',
      customerPhone: customerPhone || '',
      customerEmail: customerEmail || '',
      notes: notes || '',
      ownerId,
    }, { syncToGoogle: true });

    res.json({ appointment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;