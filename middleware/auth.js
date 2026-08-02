const jwt = require('jsonwebtoken');
const { getDatabase, get } = require('../database');

if (!process.env.JWT_SECRET) {
  // Fail hard on boot if secret missing — no fallback (audit 1.2)
  throw new Error('JWT_SECRET environment variable is required. Set it in .env or the deployment environment.');
}

const JWT_SECRET = process.env.JWT_SECRET;

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

async function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    await getDatabase();
    const keyData = await get(`
      SELECT api_keys.id as key_id, api_keys.key, users.id as user_id, users.name, users.email, users.role
      FROM api_keys
      JOIN users ON api_keys.user_id = users.id
      WHERE api_keys.key = ?
    `, [apiKey]);

    if (!keyData) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    await get('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?', [keyData.key_id]);

    req.user = {
      id: keyData.user_id,
      name: keyData.name,
      email: keyData.email,
      role: keyData.role
    };
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

// Accept either a JWT bearer token OR an API key (x-api-key header)
function verifyTokenOrApiKey(req, res, next) {
  if (req.headers['x-api-key']) {
    return verifyApiKey(req, res, next);
  }
  return verifyToken(req, res, next);
}

// Optional auth: never rejects. Sets req.user only when a valid Bearer token
// is present (used for endpoints that are public but return more data when authed).
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (_) {
        // Invalid/expired token — treat as anonymous
      }
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireClient(req, res, next) {
  if (!req.user || req.user.role !== 'client') {
    return res.status(403).json({ error: 'Client access required' });
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  verifyTokenOrApiKey,
  verifyApiKey,
  optionalAuth,
  requireAdmin,
  requireClient
};

