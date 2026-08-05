// ---------------------------------------------------------------------------
// src/admin/controllers/servers.controller.js
// Server management (admin module).
// ---------------------------------------------------------------------------
const { getDatabase, get, run, query } = require('../../config/db');
const { serverSchema } = require('../schemas/server.schema');

class ServersController {
  // GET /api/admin/servers - List servers (with client names)
  static async list(req, res) {
    try {
      await getDatabase();
      const servers = await query(`
        SELECT s.*, u.name as client_name
        FROM servers s
        LEFT JOIN users u ON s.client_id = u.id
        ORDER BY s.created_at DESC
      `);
      res.json({ servers });
    } catch (err) {
      console.error('Servers list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/admin/servers - Add server
  static async create(req, res) {
    try {
      const parsed = serverSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { server_name, ip, port, client_id } = parsed.data;
      await getDatabase();

      const result = await run(
        'INSERT INTO servers (server_name, ip, port, client_id) VALUES (?, ?, ?, ?)',
        [server_name, ip, port, client_id || null]
      );

      const server = await get('SELECT * FROM servers WHERE id = ?', [result.lastId]);
      res.status(201).json({ message: 'Server added', server });
    } catch (err) {
      console.error('Add server error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/admin/servers/:id - Update server
  static async update(req, res) {
    try {
      const parsed = serverSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { server_name, ip, port, client_id } = parsed.data;
      await getDatabase();

      const existing = await get('SELECT id FROM servers WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Server not found' });

      const updates = [];
      const params = [];
      if (server_name !== undefined) { updates.push('server_name = ?'); params.push(server_name); }
      if (ip !== undefined) { updates.push('ip = ?'); params.push(ip); }
      if (port !== undefined) { updates.push('port = ?'); params.push(port); }
      if (client_id !== undefined) { updates.push('client_id = ?'); params.push(client_id || null); }
      if (updates.length > 0) {
        params.push(req.params.id);
        await run(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const server = await get('SELECT * FROM servers WHERE id = ?', [req.params.id]);
      res.json({ message: 'Server updated', server });
    } catch (err) {
      console.error('Update server error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // DELETE /api/admin/servers/:id - Delete server
  static async remove(req, res) {
    try {
      await getDatabase();
      const result = await run('DELETE FROM servers WHERE id = ?', [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: 'Server not found' });
      res.json({ message: 'Server deleted' });
    } catch (err) {
      console.error('Delete server error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = ServersController;
