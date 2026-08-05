// ---------------------------------------------------------------------------
// src/admin/controllers/messages.controller.js
// Admin message inbox.
// ---------------------------------------------------------------------------
const { getDatabase, query } = require('../../config/db');

class AdminMessagesController {
  // GET /api/admin/messages - All messages with project/client info
  static async messages(req, res) {
    try {
      await getDatabase();
      const messages = await query(`
        SELECT m.*, p.title as project_title, p.client_id,
          u.name as client_name, u.email as client_email,
          CASE
            WHEN m.sender_role = 'crew' THEN (SELECT cm.name FROM crew_members cm WHERE cm.id = m.sender_id)
            ELSE u.name
          END as sender_name
        FROM messages m
        JOIN projects p ON m.project_id = p.id
        JOIN users u ON p.client_id = u.id
        ORDER BY m.created_at DESC
        LIMIT 200
      `);
      res.json({ messages });
    } catch (err) {
      console.error('Admin messages error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = AdminMessagesController;
