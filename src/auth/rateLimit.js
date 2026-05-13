const { pool } = require('../db');
const { getSetting } = require('../settings');

const ROLE_LIMITS = {
  guest: 'rate_limit_guest',
  user: 'rate_limit_user',
  premium: 'rate_limit_premium',
  admin: 'rate_limit_admin',
};

async function getUserRole(userId) {
  try {
    const [rows] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
    return rows.length > 0 ? rows[0].role : 'guest';
  } catch {
    return 'user';
  }
}

async function checkRateLimit(userId, role) {
  if (role === 'admin') return { allowed: true, remaining: Infinity };

  const limitKey = ROLE_LIMITS[role] || ROLE_LIMITS.user;
  const limit = parseInt(await getSetting(limitKey, '30')) || 30;

  const windowHours = 24;
  const serviceType = 'chat';

  const [rows] = await pool.execute(
    'SELECT request_count, window_start FROM rate_limits WHERE user_id = ? AND service_type = ?',
    [userId, serviceType]
  );

  const now = new Date();

  if (rows.length === 0) {
    await pool.execute(
      'INSERT INTO rate_limits (user_id, service_type, request_count, window_start) VALUES (?, ?, 1, NOW())',
      [userId, serviceType]
    );
    return { allowed: true, remaining: limit - 1, limit, resetIn: windowHours * 60 };
  }

  const row = rows[0];
  const windowStart = new Date(row.window_start);
  const elapsedMs = now - windowStart;
  const windowMs = windowHours * 60 * 60 * 1000;

  if (elapsedMs >= windowMs) {
    await pool.execute(
      'UPDATE rate_limits SET request_count = 1, window_start = NOW() WHERE user_id = ? AND service_type = ?',
      [userId, serviceType]
    );
    return { allowed: true, remaining: limit - 1, limit, resetIn: windowHours * 60 };
  }

  if (row.request_count >= limit) {
    const remainingMs = windowMs - elapsedMs;
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { allowed: false, remaining: 0, limit, resetIn: remainingMin };
  }

  await pool.execute(
    'UPDATE rate_limits SET request_count = request_count + 1 WHERE user_id = ? AND service_type = ?',
    [userId, serviceType]
  );

  return { allowed: true, remaining: limit - row.request_count - 1, limit, resetIn: Math.ceil((windowMs - elapsedMs) / 60000) };
}

async function checkBan(userId) {
  const role = await getUserRole(userId);
  return role === 'banned';
}

async function rateLimitMiddleware(req, res, next) {
  const userId = req.userId || req.body?.userId || 'user_default';
  const role = req.userRole || await getUserRole(userId);

  if (role === 'banned') {
    return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.', banned: true });
  }

  const result = await checkRateLimit(userId, role);
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', result.resetIn);

  if (!result.allowed) {
    return res.status(429).json({
      error: `Limite de mensagens atingido (${result.limit}/dia). Tente novamente em ${result.resetIn} minutos.`,
      limit: result.limit,
      remaining: 0,
      resetIn: result.resetIn,
    });
  }

  next();
}

module.exports = { rateLimitMiddleware, checkRateLimit, checkBan, getUserRole };