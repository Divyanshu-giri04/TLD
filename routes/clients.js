const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, prepare } = require('../database');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients - List all clients (admin only)
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const clients = prepare(`
      SELECT id, name, email, company, phone, status, created_at,
        (SELECT COUNT(*) FROM projects WHERE client_id = users.id) as project_count,
        (SELECT COUNT(*) FROM messages WHERE sender_id = users.id AND is_read = 0) as unread_messages
      FROM users WHERE role = 'client' 
      ORDER BY created_at DESC
    `).all();

    res.json({ clients });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients - Create client (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, company, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    await getDatabase();
    const existing = prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    prepare('INSERT INTO users (name, email, password, company, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(
      name, email, hashedPassword, company || '', phone || '', 'client'
    );

    // Get the newly created client
    const client = prepare('SELECT id, name, email, company, phone, status, created_at FROM users ORDER BY id DESC LIMIT 1').get();

    // Generate API key
    const apiKey = uuidv4();
    prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)').run(client.id, apiKey, 'Default');

    res.status(201).json({ message: 'Client created', client, api_key: apiKey });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:id - Update client (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, company, phone, status, password } = req.body;
    await getDatabase();

    const existing = prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (company !== undefined) { updates.push('company = ?'); params.push(company); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (password) { 
      const hashedPass = bcrypt.hashSync(password, 10);
      updates.push('password = ?'); 
      params.push(hashedPass); 
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const client = prepare('SELECT id, name, email, company, phone, status FROM users WHERE id = ?').get(req.params.id);
    res.json({ message: 'Client updated', client });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:id - Delete client (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const result = prepare('DELETE FROM users WHERE id = ? AND role = ?').run(req.params.id, 'client');

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

