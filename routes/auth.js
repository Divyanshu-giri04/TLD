const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, prepare } = require('../database');
const { generateToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register - Client registration
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, company, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    await getDatabase();
    const existing = prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = prepare('INSERT INTO users (name, email, password, company, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(
      name, email, hashedPassword, company || '', phone || '', 'client'
    );

    // Generate API key for new client
    const apiKey = uuidv4();
    prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)').run(result.changes, apiKey, 'Default');

    // Get the last inserted ID
    const users = prepare('SELECT id, name, email, role, company, phone, created_at FROM users ORDER BY id DESC LIMIT 1').all();
    const user = users[0];

    const token = generateToken(user);

    res.status(201).json({
      message: 'Registration successful',
      token,
      api_key: apiKey,
      user
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    await getDatabase();
    const user = prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get API keys
    const apiKeys = prepare('SELECT key, label, last_used FROM api_keys WHERE user_id = ?').all(user.id);

    const token = generateToken(user);
    const { password: _, ...userData } = user;

    res.json({
      message: 'Login successful',
      token,
      api_keys: apiKeys,
      user: userData
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const user = prepare('SELECT id, name, email, role, company, phone, avatar, status, created_at FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const apiKeys = prepare('SELECT id, key, label, last_used, created_at FROM api_keys WHERE user_id = ?').all(user.id);

    res.json({ user, api_keys: apiKeys });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/generate-key - Generate new API key
router.post('/generate-key', verifyToken, async (req, res) => {
  try {
    const { label } = req.body;
    const apiKey = uuidv4();
    await getDatabase();

    prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)').run(
      req.user.id, apiKey, label || 'New Key'
    );

    res.status(201).json({
      message: 'API key generated',
      api_key: apiKey,
      label: label || 'New Key'
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/auth/revoke-key/:id - Revoke API key
router.delete('/revoke-key/:id', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const result = prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json({ message: 'API key revoked' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

