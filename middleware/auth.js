const jwt = require('jsonwebtoken');
const { getDatabase, prepare } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'tld-company-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
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

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireClient(req, res, next) {
  if (req.user.role !== 'client') {
    return res.status(403).json({ error: 'Client access required' });
  }
  next();
}

async function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    await getDatabase();
    const keyData = prepare(`
      SELECT api_keys.*, users.id as user_id, users.name, users.email, users.role 
      FROM api_keys 
      JOIN users ON api_keys.user_id = users.id 
      WHERE api_keys.key = ?
    `).get(apiKey);

    if (!keyData) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Update last used
    prepare('UPDATE api_keys SET last_used = datetime("now","localtime") WHERE id = ?').run(keyData.id);

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

module.exports = { generateToken, verifyToken, requireAdmin, requireClient, verifyApiKey };

