const { pool } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
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

function rowToUser(row) {
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    name: row.name,
    googleId: row.google_id,
    avatar: row.avatar,
    ollamaApiKey: row.ollama_api_key,
    telegramChatId: row.telegram_chat_id,
    role: row.role || 'user',
    personaId: row.persona_id || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

async function register(email, password, name) {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('Email já cadastrado');
  }

  const userId = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.execute(
    'INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)',
    [userId, email, hashedPassword, name || '']
  );

  return { id: userId, email, name: name || '' };
}

async function login(email, password) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  if (rows.length === 0) {
    throw new Error('Email não encontrado');
  }

  const user = rowToUser(rows[0]);

  if (!user.password) {
    throw new Error('Esta conta usa login com Google. Use o botão "Entrar com Google".');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new Error('Senha incorreta');
  }

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
  return jwt.sign({ id: user.id, email: user.email, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '30d' });
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
  const user = rowToUser(rows[0]);
  const { password, ...safe } = user;
  return safe;
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

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  const token = auth.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  req.userId = decoded.id;
  req.userRole = decoded.role || 'user';
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
  const user = rowToUser(rows[0]);
  const { password, ...safe } = user;
  return safe;
}

module.exports = {
  register,
  login,
  generateToken,
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
  createUser: async function(id, name, role = 'user') {
    const [existing] = await pool.execute('SELECT id FROM users WHERE id = ?', [id]);
    if (existing.length > 0) return existing[0].id;
    await pool.execute('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)', [id, `${id}@bot`, name || id, role]);
    return id;
  },
};