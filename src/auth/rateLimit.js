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
  const windowMs = windowHours * 60 * 60 * 1000;
  const serviceType = 'chat';

  await pool.execute(
    'INSERT INTO rate_limits (user_id, service_type, request_count, window_start) VALUES (?, ?, 1, NOW()) ON DUPLICATE KEY UPDATE request_count = IF(window_start IS NULL OR TIMESTAMPDIFF(HOUR, window_start, NOW()) >= ?, 1, request_count + 1), window_start = IF(window_start IS NULL OR TIMESTAMPDIFF(HOUR, window_start, NOW()) >= ?, NOW(), window_start)',
    [userId, serviceType, windowHours, windowHours]
  );

  const [rows] = await pool.execute(
    'SELECT request_count, window_start FROM rate_limits WHERE user_id = ? AND service_type = ?',
    [userId, serviceType]
  );

  const row = rows[0];

  if (row.request_count > limit) {
    const windowStart = new Date(row.window_start);
    const elapsedMs = Date.now() - windowStart;
    const remainingMs = windowMs - elapsedMs;
    const remainingMin = Math.ceil(remainingMs / 60000);
    await pool.execute(
      'UPDATE rate_limits SET request_count = ? WHERE user_id = ? AND service_type = ?',
      [limit, userId, serviceType]
    );
    return { allowed: false, remaining: 0, limit, resetIn: remainingMin };
  }

  const remaining = limit - row.request_count;
  return { allowed: true, remaining, limit, resetIn: Math.ceil(windowMs / 60000) };
}

async function checkBan(userId) {
  const role = await getUserRole(userId);
  return role === 'banned';
}

async function rateLimitMiddleware(req, res, next) {
  const userId = req.userId || 'user_default';
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