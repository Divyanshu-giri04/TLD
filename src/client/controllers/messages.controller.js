// ---------------------------------------------------------------------------
// src/client/controllers/messages.controller.js
// Project messages + unread counts (client, crew, admin).
// ---------------------------------------------------------------------------
const { getDatabase, get, run, query } = require('../../config/db');
const { sendMessageSchema } = require('../schemas/message.schema');

// Helper: resolve crew member by JWT id (with fallback)
async function resolveCrew(user) {
  let crew = await get('SELECT * FROM crew_members WHERE id = ?', [user.id]);
  if (!crew) {
    crew = await get('SELECT * FROM crew_members WHERE email = ? OR code = ? OR login_id = ?', [
      user.email || '', user.code || '', user.login_id || ''
    ]);
  }
  return crew;
}

class MessagesController {
  // GET /api/projects/:projectId/messages - Get messages for a project
  static async list(req, res) {
    try {
      await getDatabase();
      const project = await get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check access: admin, the project owner, or an assigned crew member
      let allowed = req.user.role === 'admin' || (req.user.role === 'client' && project.client_id === req.user.id);
      if (!allowed && req.user.role === 'crew') {
        const crew = await resolveCrew(req.user);
        if (crew) {
          const assign = await get('SELECT id FROM project_assignments WHERE project_id = ? AND crew_id = ?', [project.id, crew.id]);
          allowed = !!assign;
        }
      }

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const messages = await query(`
        SELECT m.*,
          CASE
            WHEN m.sender_role = 'crew' THEN (SELECT cm.name FROM crew_members cm WHERE cm.id = m.sender_id)
            ELSE (SELECT u.name FROM users u WHERE u.id = m.sender_id)
          END as sender_name,
          m.sender_role as sender_user_role
        FROM messages m
        WHERE m.project_id = ?
        ORDER BY m.created_at ASC
      `, [req.params.projectId]);

      // Mark messages as read if user is admin
      if (req.user.role === 'admin') {
        await run('UPDATE messages SET is_read = 1 WHERE project_id = ? AND sender_role = ?', [
          req.params.projectId, 'client'
        ]);
      }

      res.json({ messages });
    } catch (err) {
      console.error('Messages error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/projects/:projectId/messages - Send message
  static async create(req, res) {
    try {
      const parsed = sendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { content } = parsed.data;

      await getDatabase();
      const project = await get('SELECT * FROM projects WHERE id = ?', [req.params.projectId]);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Check access: admin, the project owner, or an assigned crew member
      let allowed = req.user.role === 'admin' || (req.user.role === 'client' && project.client_id === req.user.id);
      if (!allowed && req.user.role === 'crew') {
        const crew = await resolveCrew(req.user);
        if (crew) {
          const assign = await get('SELECT id FROM project_assignments WHERE project_id = ? AND crew_id = ?', [project.id, crew.id]);
          allowed = !!assign;
        }
      }

      if (!allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const senderRole = req.user.role === 'admin' ? 'admin' : (req.user.role === 'crew' ? 'crew' : 'client');

      // Use last_insert_rowid on SQLite, RETURNING on Postgres
      const result = await run(`
        INSERT INTO messages (project_id, sender_id, sender_role, content)
        VALUES (?, ?, ?, ?)
      `, [req.params.projectId, req.user.id, senderRole, content]);

      const message = await get(`
        SELECT m.*,
          CASE
            WHEN m.sender_role = 'crew' THEN (SELECT cm.name FROM crew_members cm WHERE cm.id = m.sender_id)
            ELSE (SELECT u.name FROM users u WHERE u.id = m.sender_id)
          END as sender_name,
          m.sender_role as sender_user_role
        FROM messages m
        WHERE m.id = ?
      `, [result.lastId]);

      res.status(201).json({ message });
    } catch (err) {
      console.error('Send message error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // GET /api/projects/:projectId/messages   → handled by list
  // GET /api/messages/unread - Get unread message count
  static async unread(req, res) {
    try {
      await getDatabase();
      let count;

      if (req.user.role === 'admin') {
        count = (await get("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = ?", ['client'])).count;
      } else if (req.user.role === 'crew') {
        const crew = await resolveCrew(req.user);
        if (!crew) {
          return res.json({ unread_count: 0 });
        }
        count = (await get(`
          SELECT COUNT(*) as count FROM messages m
          JOIN project_assignments pa ON pa.project_id = m.project_id
          WHERE pa.crew_id = ? AND m.is_read = 0 AND m.sender_role != 'crew'
        `, [crew.id])).count;
      } else {
        count = (await get(`
          SELECT COUNT(*) as count FROM messages m
          JOIN projects p ON m.project_id = p.id
          WHERE p.client_id = ? AND m.is_read = 0 AND m.sender_role != 'client'
        `, [req.user.id])).count;
      }

      res.json({ unread_count: count });
    } catch (err) {
      console.error('Unread error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = MessagesController;
