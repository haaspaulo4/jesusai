const { pool } = require('../../db');

function paginated(req, maxLimit = 500) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), maxLimit);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  return { limit, offset };
}

function adminMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function premiumMiddleware(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!['admin', 'premium', 'user'].includes(req.userRole)) return res.status(403).json({ error: 'Access denied' });
  next();
}

function safeError(err, userRole) {
  if (userRole === 'admin') return err.message;
  const safeMessages = ['not found', 'already exists', 'required', 'invalid', 'expired', 'unauthorized'];
  const msg = (err.message || '').toLowerCase();
  if (safeMessages.some(s => msg.includes(s))) return err.message;
  return 'Internal error';
}

async function resolveOwnerId(req) {
  if (req.userRole === 'admin' && req.body.owner_id) {
    const [rows] = await pool.execute('SELECT id FROM users WHERE id = ?', [req.body.owner_id]);
    if (rows.length === 0) throw new Error('owner_id not found');
    return req.body.owner_id;
  }
  return req.userId;
}

function checkOwner(ownerId, userId, userRole) {
  if (userRole === 'admin') return true;
  return ownerId === userId;
}

module.exports = { paginated, adminMiddleware, premiumMiddleware, safeError, resolveOwnerId, checkOwner };
