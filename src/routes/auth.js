const express = require('express');
const { generateToken, generateRefreshToken, authMiddleware, getUser, updateUser, getUserWithRole, findOrCreateFromGoogle, generateLinkCode, linkAccount, findLinkedUser, pool, verifyToken, safeUser } = require('../auth');
const { register, login } = require('../auth/index');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    if (email.length > 255 || /[<>"';&]/.test(email)) {
      return res.status(400).json({ error: 'Email contém caracteres inválidos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Senha deve conter pelo menos uma letra maiúscula' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Senha deve conter pelo menos um número' });
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Senha deve conter pelo menos um caractere especial' });
    }

    const user = await register(email, password, name);
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({ user: { id: user.id, email: user.email, name: user.name, role: 'user' }, token, refreshToken });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const { id, email: userEmail, name } = await login(email, password);
    const fullUser = await getUserWithRole(id);
    const token = generateToken(fullUser);
    const refreshToken = generateRefreshToken(fullUser);

    res.json({ user: { id: fullUser.id, email: fullUser.email, name: fullUser.name, role: fullUser.role, avatar: fullUser.avatar }, token, refreshToken });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { idToken, email, name, googleId, avatar } = req.body;

    if (!idToken || !email || !googleId) {
      return res.status(400).json({ error: 'Dados do Google incompletos' });
    }

    if (!email.includes('@') || email.length > 255 || /[<>"';&]/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

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
    if (!code || !botUserId || !source) {
      return res.status(400).json({ error: 'Código, botUserId e source são obrigatórios' });
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
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve conter pelo menos uma letra maiúscula' });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve conter pelo menos um número' });
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      return res.status(400).json({ error: 'Nova senha deve conter pelo menos um caractere especial' });
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

module.exports = router;