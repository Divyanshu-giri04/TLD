// ---------------------------------------------------------------------------
// src/admin/controllers/admin.controller.js
// All admin-only logic: dashboard, stats, settings, messages, reset-password,
// servers, and teams.
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const {
  getDatabase, get, run, query, isPostgres
} = require('../../config/db');
const {
  adminResetPasswordSchema,
  serverSchema,
  teamSchema
} = require('../../utils/schemas');

class AdminController {
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
        recent_messages: await query(`
          SELECT m.*, p.title as project_title, p.client_id,
            CASE
              WHEN m.sender_role = 'crew' THEN (SELECT cm.name FROM crew_members cm WHERE cm.id = m.sender_id)
              ELSE (SELECT u.name FROM users u WHERE u.id = m.sender_id)
            END as sender_name
          FROM messages m
          JOIN projects p ON m.project_id = p.id
          ORDER BY m.created_at DESC LIMIT 5
        `)
      };

      // Monthly projects for chart — driver-aware
      const monthExpr = isPostgres()
        ? "to_char(created_at, 'YYYY-MM')"
        : "strftime('%Y-%m', created_at)";
      const monthlyProjects = await query(`
        SELECT ${monthExpr} as month, COUNT(*) as count
        FROM projects
        GROUP BY month ORDER BY month ASC LIMIT 12
      `);

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

  // GET /api/admin/settings - Get site settings
  static async getSettings(req, res) {
    try {
      await getDatabase();
      const settings = await query('SELECT * FROM site_settings');
      const settingsObj = {};
      settings.forEach(s => { settingsObj[s.key] = s.value; });
      res.json({ settings: settingsObj });
    } catch (err) {
      console.error('Settings error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/admin/settings - Update site settings
  static async updateSettings(req, res) {
    try {
      const { settings } = req.body;
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object required' });
      }
      await getDatabase();

      for (const [key, value] of Object.entries(settings)) {
        const existing = await get('SELECT id FROM site_settings WHERE key = ?', [key]);
        if (existing) {
          await run('UPDATE site_settings SET value = ? WHERE key = ?', [value, key]);
        } else {
          await run('INSERT INTO site_settings (key, value) VALUES (?, ?)', [key, value]);
        }
      }

      res.json({ message: 'Settings updated' });
    } catch (err) {
      console.error('Update settings error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

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

  // POST /api/admin/reset-password - Admin resets any user/crew password
  static async resetPassword(req, res) {
    try {
      const parsed = adminResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { type, email, new_password } = parsed.data;
      await getDatabase();

      const hashed = bcrypt.hashSync(new_password, 10);
      let target;

      if (type === 'client') {
        target = await get('SELECT id FROM users WHERE email = ? AND role = ?', [email, 'client']);
        if (!target) return res.status(404).json({ error: 'Client not found' });
        await run('UPDATE users SET password = ? WHERE id = ?', [hashed, target.id]);
      } else if (type === 'crew') {
        target = await get('SELECT id, email, name FROM crew_members WHERE email = ? OR login_id = ?', [email, email]);
        if (!target) return res.status(404).json({ error: 'Crew member not found' });
        await run('UPDATE crew_members SET password = ? WHERE id = ?', [hashed, target.id]);
      } else {
        target = await get('SELECT id FROM users WHERE email = ? AND role = ?', [email, 'admin']);
        if (!target) return res.status(404).json({ error: 'Admin not found' });
        await run('UPDATE users SET password = ? WHERE id = ?', [hashed, target.id]);
      }

      res.json({ message: 'Password reset successful' });
    } catch (err) {
      console.error('Admin reset password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // ===== SERVERS =====

  // GET /api/admin/servers - List servers (with client names)
  static async listServers(req, res) {
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
  static async addServer(req, res) {
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
  static async updateServer(req, res) {
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
  static async deleteServer(req, res) {
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

  // ===== TEAMS =====

  // GET /api/admin/teams - List teams with members
  static async listTeams(req, res) {
    try {
      await getDatabase();
      const teams = await query(`
        SELECT t.*, p.title as project_title, u.name as client_name,
          (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
        FROM teams t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN users u ON t.client_id = u.id
        ORDER BY t.created_at DESC
      `);

      // Attach members
      for (const team of teams) {
        team.members = await query(`
          SELECT cm.id, cm.name, cm.role, cm.code, cm.login_id, cm.status
          FROM team_members tm
          JOIN crew_members cm ON tm.crew_id = cm.id
          WHERE tm.team_id = ?
        `, [team.id]);
      }

      res.json({ teams });
    } catch (err) {
      console.error('Teams list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/admin/teams - Create team with members
  static async createTeam(req, res) {
    try {
      const parsed = teamSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { project_id, team_name, client_id, crew_ids } = parsed.data;
      await getDatabase();

      const project = await get('SELECT client_id FROM projects WHERE id = ?', [project_id]);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const result = await run(
        'INSERT INTO teams (project_id, team_name, client_id) VALUES (?, ?, ?)',
        [project_id, team_name, client_id || project.client_id]
      );
      const teamId = result.lastId;

      for (const crewId of [...new Set(crew_ids)]) {
        await run('INSERT INTO team_members (team_id, crew_id) VALUES (?, ?)', [teamId, crewId]);
      }

      const team = await get('SELECT * FROM teams WHERE id = ?', [teamId]);
      team.members = await query('SELECT cm.* FROM team_members tm JOIN crew_members cm ON tm.crew_id = cm.id WHERE tm.team_id = ?', [teamId]);

      res.status(201).json({ message: 'Team created', team });
    } catch (err) {
      console.error('Create team error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/admin/teams/:id - Update team name/members
  static async updateTeam(req, res) {
    try {
      const { team_name, client_id, crew_ids } = req.body;
      await getDatabase();

      const existing = await get('SELECT id FROM teams WHERE id = ?', [req.params.id]);
      if (!existing) return res.status(404).json({ error: 'Team not found' });

      const updates = [];
      const params = [];
      if (team_name !== undefined) { updates.push('team_name = ?'); params.push(team_name); }
      if (client_id !== undefined) { updates.push('client_id = ?'); params.push(client_id || null); }
      if (updates.length > 0) {
        params.push(req.params.id);
        await run(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      if (crew_ids && Array.isArray(crew_ids)) {
        await run('DELETE FROM team_members WHERE team_id = ?', [req.params.id]);
        for (const crewId of [...new Set(crew_ids)]) {
          await run('INSERT INTO team_members (team_id, crew_id) VALUES (?, ?)', [req.params.id, crewId]);
        }
      }

      const team = await get('SELECT * FROM teams WHERE id = ?', [req.params.id]);
      team.members = await query('SELECT cm.* FROM team_members tm JOIN crew_members cm ON tm.crew_id = cm.id WHERE tm.team_id = ?', [req.params.id]);

      res.json({ message: 'Team updated', team });
    } catch (err) {
      console.error('Update team error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // DELETE /api/admin/teams/:id - Delete team
  static async deleteTeam(req, res) {
    try {
      await getDatabase();
      const result = await run('DELETE FROM teams WHERE id = ?', [req.params.id]);
      if (result.changes === 0) return res.status(404).json({ error: 'Team not found' });
      res.json({ message: 'Team deleted' });
    } catch (err) {
      console.error('Delete team error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = AdminController;
