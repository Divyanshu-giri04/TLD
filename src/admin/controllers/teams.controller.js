// ---------------------------------------------------------------------------
// src/admin/controllers/teams.controller.js
// Team management (admin module).
// ---------------------------------------------------------------------------
const { getDatabase, get, run, query } = require('../../config/db');
const { teamSchema } = require('../schemas/team.schema');

class TeamsController {
  // GET /api/admin/teams - List teams with members
  static async list(req, res) {
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
  static async create(req, res) {
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
  static async update(req, res) {
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
  static async remove(req, res) {
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

module.exports = TeamsController;
