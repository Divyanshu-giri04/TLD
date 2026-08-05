// ---------------------------------------------------------------------------
// src/shared/controllers/files.controller.js
// Authenticated, ownership-checked file serving (audit 2.7).
// ---------------------------------------------------------------------------
const path = require('path');
const fs = require('fs');
const {
  getDatabase, query
} = require('../../config/db');
const { verifyTokenOrApiKey } = require('../../middleware/auth');

const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');

function hasFile(project, filename) {
  try {
    const files = JSON.parse(project.files || '[]');
    return files.some(f => f && f.path === filename);
  } catch (_) {
    return false;
  }
}

class FilesController {
  // GET /api/files/:filename — authenticated, ownership-checked file serving
  static async serve(req, res) {
    try {
      await getDatabase();
      const { filename } = req.params;

      // Prevent path traversal
      if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9]+)?$/.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      const filePath = path.join(uploadsDir, filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Admins can access any file
      if (req.user.role === 'admin') {
        return res.sendFile(filePath);
      }

      let owned = false;

      if (req.user.role === 'client') {
        // Clients: only files belonging to their projects
        const projects = await query('SELECT id, files FROM projects WHERE client_id = ?', [req.user.id]);
        owned = projects.some(p => hasFile(p, filename));
      } else if (req.user.role === 'crew') {
        // Crew: only files on their assigned projects
        let crew = await query('SELECT id FROM crew_members WHERE id = ?', [req.user.id]);
        if (crew.length === 0) {
          crew = await query('SELECT id FROM crew_members WHERE email = ? OR code = ? OR login_id = ?', [
            req.user.email || '', req.user.code || '', req.user.login_id || ''
          ]);
        }
        if (crew.length > 0) {
          const crewId = crew[0].id;
          const projects = await query(`
            SELECT p.id, p.files FROM projects p
            JOIN project_assignments pa ON pa.project_id = p.id
            WHERE pa.crew_id = ?
          `, [crewId]);
          owned = projects.some(p => hasFile(p, filename));
        }
      }

      if (!owned) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.sendFile(filePath);
    } catch (err) {
      console.error('File serve error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = FilesController;
