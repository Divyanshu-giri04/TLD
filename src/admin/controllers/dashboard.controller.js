// ---------------------------------------------------------------------------
// src/admin/controllers/dashboard.controller.js
// Admin dashboard + stats.
// ---------------------------------------------------------------------------
const { getDatabase, get, query, isMongo, isPostgres } = require('../../config/db');

// Resolve a message sender's display name given its role and sender id.
// Works on both Mongo and SQL by querying the relevant collection.
async function resolveSenderName(senderRole, senderId) {
  if (!senderId) return senderRole || 'unknown';
  try {
    if (senderRole === 'crew') {
      const c = await get('SELECT name FROM crew_members WHERE id = ?', [Number(senderId)]);
      return (c && c.name) || ('crew#' + senderId);
    }
    const u = await get('SELECT name FROM users WHERE id = ?', [Number(senderId)]);
    return (u && u.name) || ('user#' + senderId);
  } catch (_) {
    return senderRole || 'unknown';
  }
}

class DashboardController {
  // GET /api/admin/dashboard - Dashboard statistics
  static async dashboard(req, res) {
    try {
      await getDatabase();

      const stats = {
        total_clients: (await get("SELECT COUNT(*) as count FROM users WHERE role = ?", ['client'])).count,
        total_projects: (await get('SELECT COUNT(*) as count FROM projects')).count,
        active_projects: (await get("SELECT COUNT(*) as count FROM projects WHERE status IN ('discovery','in_progress')")).count,
        completed_projects: (await get("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'")).count,
        unread_messages: (await get("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = 'client'")).count,
        total_crew: (await get('SELECT COUNT(*) as count FROM crew_members')).count,
        total_teams: (await get('SELECT COUNT(*) as count FROM teams')).count,
        total_servers: (await get('SELECT COUNT(*) as count FROM servers')).count,
        recent_projects: await query(`
          SELECT p.*, u.name as client_name, u.company as client_company
          FROM projects p
          JOIN users u ON p.client_id = u.id
          ORDER BY p.created_at DESC LIMIT 5
        `),
        project_status_distribution: await query('SELECT status, COUNT(*) as count FROM projects GROUP BY status'),
        // recent_messages — resolve sender_name in JS when Mongo is active (the
        // CASE/subquery expression is SQL-specific and not translatable).
        recent_messages: await (async () => {
          const rows = await query(`
            SELECT m.*, p.title as project_title, p.client_id
            FROM messages m
            JOIN projects p ON m.project_id = p.id
            ORDER BY m.created_at DESC LIMIT 5
          `);
          if (isMongo()) {
            for (const row of rows) {
              row.sender_name = await resolveSenderName(row.sender_role, row.sender_id);
            }
          }
          return rows;
        })()
      };

      // Monthly projects for chart — driver-aware
      let monthlyProjects;
      if (isMongo()) {
        // Fetch all created_at values and bucket by YYYY-MM in JS.
        const all = await query('SELECT created_at FROM projects');
        const buckets = new Map();
        for (const r of all) {
          const d = new Date(r.created_at);
          if (isNaN(d.getTime())) continue;
          const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        monthlyProjects = [...buckets.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-12)
          .map(([month, count]) => ({ month, count }));
      } else {
        const monthExpr = isPostgres()
          ? "to_char(created_at, 'YYYY-MM')"
          : "strftime('%Y-%m', created_at)";
        monthlyProjects = await query(`
          SELECT ${monthExpr} as month, COUNT(*) as count
          FROM projects
          GROUP BY month ORDER BY month ASC LIMIT 12
        `);
      }

      res.json({ stats, monthly_projects: monthlyProjects });
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // GET /api/admin/stats - Quick stats for sidebar
  static async stats(req, res) {
    try {
      await getDatabase();

      const stats = {
        clients: (await get("SELECT COUNT(*) as count FROM users WHERE role = ?", ['client'])).count,
        projects: (await get('SELECT COUNT(*) as count FROM projects')).count,
        active: (await get("SELECT COUNT(*) as count FROM projects WHERE status IN ('discovery','in_progress')")).count,
        unread: (await get("SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND sender_role = 'client'")).count
      };

      res.json(stats);
    } catch (err) {
      console.error('Stats error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = DashboardController;
