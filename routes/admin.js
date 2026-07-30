const express = require('express');
const { getDatabase, prepare, exec } = require('../database');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/dashboard - Dashboard statistics
router.get('/dashboard', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();

    const stats = {
      total_clients: prepare("SELECT COUNT(*) as count FROM users WHERE role = ?").get('client').count,
      total_projects: prepare('SELECT COUNT(*) as count FROM projects').get().count,
      active_projects: prepare("SELECT COUNT(*) as count FROM projects WHERE status IN ('discovery','in_progress')").get().count,
      completed_projects: prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'").get().count,
      unread_messages: prepare("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = 'client'").get().count,
      total_crew: prepare('SELECT COUNT(*) as count FROM crew_members').get().count,
      recent_projects: prepare(`
        SELECT p.*, u.name as client_name, u.company as client_company
        FROM projects p 
        JOIN users u ON p.client_id = u.id 
        ORDER BY p.created_at DESC LIMIT 5
      `).all(),
      project_status_distribution: prepare(`
        SELECT status, COUNT(*) as count FROM projects GROUP BY status
      `).all(),
      recent_messages: prepare(`
        SELECT m.*, u.name as sender_name, p.title as project_title
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        JOIN projects p ON m.project_id = p.id 
        ORDER BY m.created_at DESC LIMIT 5
      `).all()
    };

    // Get monthly projects for chart (last 12 months from the data we have)
    const monthlyProjects = prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count 
      FROM projects 
      GROUP BY month ORDER BY month ASC LIMIT 12
    `).all();

    res.json({ stats, monthly_projects: monthlyProjects });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/stats - Quick stats for sidebar
router.get('/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();

    const stats = {
      clients: prepare("SELECT COUNT(*) as count FROM users WHERE role = ?").get('client').count,
      projects: prepare('SELECT COUNT(*) as count FROM projects').get().count,
      active: prepare("SELECT COUNT(*) as count FROM projects WHERE status IN ('discovery','in_progress')").get().count,
      unread: prepare("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = 'client'").get().count
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/settings - Get site settings
router.get('/settings', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const settings = prepare('SELECT * FROM site_settings').all();
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.json({ settings: settingsObj });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/settings - Update site settings
router.put('/settings', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    await getDatabase();

    for (const [key, value] of Object.entries(settings)) {
      const existing = prepare('SELECT id FROM site_settings WHERE key = ?').get(key);
      if (existing) {
        prepare('UPDATE site_settings SET value = ? WHERE key = ?').run(value, key);
      } else {
        prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(key, value);
      }
    }

    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

