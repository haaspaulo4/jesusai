const { pool } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const BOT_COL_MAP = { whatsapp: 'whatsapp_id', telegram: 'telegram_id' };
const ALLOWED_BOT_COLS = new Set(Object.values(BOT_COL_MAP));
if (!JWT_SECRET) {
  console.error('[AUTH] FATAL: JWT_SECRET environment variable is required. Set it in .env');
  process.exit(1);
}

async function getUserByEmail(email) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

async function getUserByGoogleId(googleId) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE google_id = ?', [googleId]);
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

function rowToUser(row, { includePassword = false } = {}) {
  const user = {
    id: row.id,
    email: row.email,
    name: row.name,
    googleId: row.google_id,
    avatar: row.avatar,
    ollamaApiKey: row.ollama_api_key,
    telegramChatId: row.telegram_chat_id,
    whatsappId: row.whatsapp_id || null,
    telegramId: row.telegram_id || null,
    phone: row.phone || null,
    linkCode: row.link_code || null,
    linkCodeExpires: row.link_code_expires || null,
    role: row.role || 'user',
    personaId: row.persona_id || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
  if (includePassword) {
    user.password = row.password;
  }
  return user;
}

function safeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

async function register(email, password, name) {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('Email já cadastrado');
  }

  const userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.execute(
    'INSERT INTO users (id, email, password, name, data_processing_consent, consent_date, consent_version) VALUES (?, ?, ?, ?, 1, NOW(), ?)',
    [userId, email, hashedPassword, name || '', '1.0']
  );

  return { id: userId, email, name: name || '' };
}

async function login(email, password) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    throw new Error('Email ou senha incorretos');
  }

  const user = rowToUser(rows[0], { includePassword: true });

  if (!user.password) {
    throw new Error('Esta conta usa login com Google. Use o botão "Entrar com Google".');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const [lockRows] = await pool.execute('SELECT id FROM login_attempts WHERE email = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)', [email]);
    const attemptCount = lockRows.length;
    await pool.execute('INSERT INTO login_attempts (email, ip_address) VALUES (?, ?)', [email, '']).catch(() => {});
    if (attemptCount >= 5) {
      throw new Error('Conta temporariamente bloqueada. Tente novamente em 15 minutos.');
    }
    throw new Error('Email ou senha incorretos');
  }

  await pool.execute('DELETE FROM login_attempts WHERE email = ?', [email]).catch(() => {});
  return { id: user.id, email: user.email, name: user.name };
}

async function findOrCreateFromGoogle(googleUser) {
  let user = await getUserByGoogleId(googleUser.googleId);

  if (user) {
    await pool.execute(
      'UPDATE users SET avatar = ?, name = COALESCE(NULLIF(?, ""), name) WHERE id = ?',
      [googleUser.avatar || user.avatar, googleUser.name || '', user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [user.id]);
    return rowToUser(rows[0]);
  }

  user = await getUserByEmail(googleUser.email);

  if (user) {
    await pool.execute(
      'UPDATE users SET google_id = ?, avatar = COALESCE(?, avatar), name = COALESCE(NULLIF(?, ""), name) WHERE id = ?',
      [googleUser.googleId, googleUser.avatar, googleUser.name, user.id]
    );
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [user.id]);
    return rowToUser(rows[0]);
  }

  const userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  await pool.execute(
    'INSERT INTO users (id, email, password, name, google_id, avatar) VALUES (?, ?, NULL, ?, ?, ?)',
    [userId, googleUser.email, googleUser.name || googleUser.email.split('@')[0], googleUser.googleId, googleUser.avatar || null]
  );

  return rowToUser((await pool.execute('SELECT * FROM users WHERE id = ?', [userId]))[0][0]);
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role || 'user', tv: user.token_version || 1, type: 'access' }, JWT_SECRET, { expiresIn: '1h' });
}

function generateRefreshToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role || 'user', tv: user.token_version || 1, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function getUser(userId) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

async function updateUser(userId, updates) {
  const user = await getUser(userId);
  if (!user) return null;

  const allowedFields = ['name', 'ollamaApiKey', 'avatar'];
  const setClauses = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      const colName = key === 'ollamaApiKey' ? 'ollama_api_key' : key;
      setClauses.push(`${colName} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return user;
  values.push(userId);

  await pool.execute(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, values);

  return getUser(userId);
}

async function authMiddleware(req, res, next) {
  // Localhost bypass for Cockpit development
  const clientIp = req.ip || req.connection.remoteAddress;
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    const referer = req.headers.referer || '';
    if (referer.includes('/cockpit/')) {
      req.userId = 'local_admin';
      req.userRole = 'admin';
      return next();
    }
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  const token = auth.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
  if (decoded.type === 'refresh') {
    return res.status(401).json({ error: 'Refresh token não pode ser usado para autenticação. Use o endpoint /auth/refresh.' });
  }
  req.userId = decoded.id;
  try {
    const [rows] = await pool.execute('SELECT role, token_version FROM users WHERE id = ?', [decoded.id]);
    if (rows.length > 0) {
      req.userRole = rows[0].role;
      if (rows[0].role === 'banned') {
        return res.status(403).json({ error: 'Conta suspensa' });
      }
      if (decoded.tv !== undefined && decoded.tv !== rows[0].token_version) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
      }
    } else {
      req.userRole = decoded.role || 'user';
    }
  } catch {
    req.userRole = decoded.role || 'user';
  }
  next();
}

async function roleMiddleware(...roles) {
  return async (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'Não autorizado' });
    const userRole = req.userRole;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

async function getUserRole(userId) {
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows.length > 0 ? rows[0].role : 'user';
  } catch {
    return 'user';
  }
}

async function getUserWithRole(userId) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

async function generateLinkCode(userId) {
  const [existing] = await pool.execute(
    'SELECT link_code_expires FROM users WHERE id = ? AND link_code IS NOT NULL AND link_code_expires > NOW()',
    [userId]
  );
  if (existing.length > 0) {
    const remaining = new Date(existing[0].link_code_expires) - Date.now();
    if (remaining > 10 * 60 * 1000) {
      throw new Error(`Aguarde antes de gerar outro código. Seu código atual ainda é válido por ${Math.ceil(remaining / 60000)} minutos.`);
    }
  }
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await pool.execute(
    'UPDATE users SET link_code = ?, link_code_expires = ? WHERE id = ?',
    [code, expires, userId]
  );
  return { code, expires };
}

async function linkAccount(linkCode, botUserId, source) {
  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE link_code = ? AND link_code_expires > NOW()',
    [linkCode]
  );
  if (rows.length === 0) {
    throw new Error('Código inválido ou expirado');
  }

  const webUser = rowToUser(rows[0]);

  const col = BOT_COL_MAP[source];
  if (!col || !ALLOWED_BOT_COLS.has(col)) {
    throw new Error('Invalid source for account linking');
  }
  const [existing] = await pool.execute(
    `SELECT id FROM users WHERE ${col} = ? AND id != ?`,
    [botUserId, webUser.id]
  );
  if (existing.length > 0) {
    throw new Error('Esta conta do bot já está vinculada a outro perfil');
  }

  if (source === 'whatsapp') {
    await pool.execute(
      'UPDATE users SET whatsapp_id = ?, link_code = NULL, link_code_expires = NULL WHERE id = ?',
      [botUserId, webUser.id]
    );
  } else {
    await pool.execute(
      'UPDATE users SET telegram_id = ?, link_code = NULL, link_code_expires = NULL WHERE id = ?',
      [botUserId, webUser.id]
    );
  }

  const [botRows] = await pool.execute('SELECT id FROM users WHERE id = ?', [botUserId]);
  if (botRows.length > 0) {
    const migrations = [
      { table: 'persona_messages', col: 'user_id' },
      { table: 'sessions', col: 'user_id' },
      { table: 'messages', col: null },
      { table: 'user_xp_log', col: 'user_id' },
      { table: 'user_xp', col: 'user_id' },
      { table: 'user_progress', col: 'user_id' },
      { table: 'user_onboarding', col: 'user_id' },
      { table: 'cognitive_states', col: 'user_id' },
      { table: 'agent_thoughts', col: 'user_id' },
      { table: 'follow_ups', col: 'user_id' },
      { table: 'ratings', col: 'user_id' },
      { table: 'profiles', col: 'id' },
      { table: 'persona_goals', col: 'owner_id' },
      { table: 'persona_tasks', col: 'owner_id' },
      { table: 'persona_calendar', col: 'owner_id' },
      { table: 'persona_contacts', col: 'owner_id' },
      { table: 'persona_automations', col: 'owner_id' },
      { table: 'persona_org_memory', col: 'owner_id' },
    ];
    for (const { table, col } of migrations) {
      if (!col) continue;
      try {
        await pool.execute(
          `UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`,
          [webUser.id, botUserId]
        );
      } catch {}
    }
    try {
      await pool.execute(
        'UPDATE messages m INNER JOIN sessions s ON m.session_id = s.id SET s.user_id = ? WHERE s.user_id = ?',
        [webUser.id, botUserId]
      );
    } catch {}
    for (const table of ['persona_messages', 'sessions', 'user_xp_log', 'user_xp', 'user_progress', 'user_onboarding', 'cognitive_states', 'agent_thoughts', 'follow_ups', 'ratings', 'profiles']) {
      try { await pool.execute(`DELETE FROM ${table} WHERE user_id = ?`, [botUserId]); } catch {}
    }
    try {
      await pool.execute('UPDATE user_xp SET user_id = ? WHERE user_id = ?', [webUser.id, botUserId]);
    } catch {}
    await pool.execute('DELETE FROM users WHERE id = ?', [botUserId]);
  }

  return { webUserId: webUser.id, linked: true };
}

async function findLinkedUser(botUserId, source) {
  const col = BOT_COL_MAP[source];
  if (!col || !ALLOWED_BOT_COLS.has(col)) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${col} = ?`,
    [botUserId]
  );
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

module.exports = {
  register,
  login,
  generateToken,
  generateRefreshToken,
  verifyToken,
  getUser,
  updateUser,
  authMiddleware,
  roleMiddleware,
  getUserRole,
  getUserWithRole,
  findOrCreateFromGoogle,
  getUserByGoogleId,
  pool,
  generateLinkCode,
  linkAccount,
  findLinkedUser,
  safeUser,
  invalidateTokens: async function(userId) {
    await pool.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
  },
  createUser: async function(id, name, role = 'user') {
    const [existing] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length > 0) return existing[0].id;
    await pool.execute('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)', [id, `${id}@bot`, name || id, role]);
    return id;
  },
};