// ---------------------------------------------------------------------------
// src/admin/controllers/clients.controller.js
// Client management (admin module) — list, create, update, delete clients.
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, get, run, query } = require('../../config/db');
const { createClientSchema, updateClientSchema } = require('../schemas/client.schema');

class AdminClientsController {
  // GET /api/clients - List all clients (admin only)
  static async list(req, res) {
    try {
      await getDatabase();
      const clients = await query(`
        SELECT id, name, email, company, phone, status, created_at,
          (SELECT COUNT(*) FROM projects WHERE client_id = users.id) as project_count,
          (SELECT COUNT(*) FROM messages WHERE sender_id = users.id AND is_read = 0) as unread_messages
        FROM users WHERE role = 'client'
        ORDER BY created_at DESC
      `);

      res.json({ clients });
    } catch (err) {
      console.error('Clients list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/clients - Create client (admin only)
  static async create(req, res) {
    try {
      const parsed = createClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { name, email, password, company, phone } = parsed.data;

      await getDatabase();
      const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ error: 'Email already exists' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const result = await run(
        'INSERT INTO users (name, email, password, company, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, company, phone, 'client']
      );
      const clientId = result.lastId;

      // Generate API key — attached to the real client id (audit 2.2/2.4)
      const apiKey = uuidv4();
      await run('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)', [clientId, apiKey, 'Default']);

      const client = await get(
        'SELECT id, name, email, company, phone, status, created_at FROM users WHERE id = ?',
        [clientId]
      );

      res.status(201).json({ message: 'Client created', client, api_key: apiKey });
    } catch (err) {
      console.error('Create client error:', err);
      if (err && err.constraint === 'users_email_key') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/clients/:id - Update client (admin only)
  static async update(req, res) {
    try {
      const parsed = updateClientSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { name, company, phone, status, password } = parsed.data;
      await getDatabase();

      const existing = await get('SELECT id FROM users WHERE id = ? AND role = ?', [req.params.id, 'client']);
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
        await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const client = await get('SELECT id, name, email, company, phone, status FROM users WHERE id = ?', [req.params.id]);
      res.json({ message: 'Client updated', client });
    } catch (err) {
      console.error('Update client error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // DELETE /api/clients/:id - Delete client (admin only)
  static async remove(req, res) {
    try {
      await getDatabase();
      const result = await run('DELETE FROM users WHERE id = ? AND role = ?', [req.params.id, 'client']);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      res.json({ message: 'Client deleted' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = AdminClientsController;
