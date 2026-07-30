const express = require('express');
const { getDatabase, prepare } = require('../database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects/:projectId/messages - Get messages for a project
router.get('/:projectId/messages', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const project = prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access
    if (req.user.role !== 'admin' && project.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = prepare(`
      SELECT m.*, u.name as sender_name, u.role as sender_user_role
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      WHERE m.project_id = ? 
      ORDER BY m.created_at ASC
    `).all(req.params.projectId);

    // Mark messages as read if user is admin
    if (req.user.role === 'admin') {
      prepare('UPDATE messages SET is_read = 1 WHERE project_id = ? AND sender_role = ?').run(
        req.params.projectId, 'client'
      );
    }

    res.json({ messages });
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:projectId/messages - Send message
router.post('/:projectId/messages', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    await getDatabase();
    const project = prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access
    if (req.user.role !== 'admin' && project.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const senderRole = req.user.role === 'admin' ? 'admin' : 'client';

    prepare(`
      INSERT INTO messages (project_id, sender_id, sender_role, content) 
      VALUES (?, ?, ?, ?)
    `).run(req.params.projectId, req.user.id, senderRole, content.trim());

    const message = prepare(`
      SELECT m.*, u.name as sender_name, u.role as sender_user_role
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      WHERE m.id = (SELECT MAX(id) FROM messages)
    `).get();

    res.status(201).json({ message });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/messages/unread - Get unread message count
router.get('/unread', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    let count;

    if (req.user.role === 'admin') {
      count = prepare("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = ?").get('client');
    } else {
      count = prepare(`
        SELECT COUNT(*) as count FROM messages m 
        JOIN projects p ON m.project_id = p.id 
        WHERE p.client_id = ? AND m.is_read = 0 AND m.sender_role != 'client'
      `).get(req.user.id);
    }

    res.json({ unread_count: count.count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

