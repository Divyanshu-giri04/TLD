const express = require('express');
const { z } = require('zod');
const { getDatabase, get, run, query, nowExpression } = require('../database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  department: z.string().max(30).optional().default(''),
  budget: z.string().max(50).optional().default(''),
  timeline: z.string().max(100).optional().default('')
});

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  department: z.string().max(30).nullable().optional(),
  status: z.enum(['applied', 'discovery', 'in_progress', 'review', 'completed', 'cancelled']).optional(),
  assigned_crew: z.union([z.string(), z.array(z.number())]).optional(),
  budget: z.string().max(50).nullable().optional(),
  timeline: z.string().max(100).nullable().optional(),
  start_date: z.string().max(30).optional(),
  end_date: z.string().max(30).optional()
});

function parseFiles(files) {
  try { return JSON.parse(files || '[]'); } catch (_) { return []; }
}

// Helper: resolve crew member by JWT id (with fallback)
async function resolveCrew(user) {
  let crew = await get('SELECT * FROM crew_members WHERE id = ?', [user.id]);
  if (!crew) {
    crew = await get('SELECT * FROM crew_members WHERE email = ? OR code = ? OR login_id = ?', [
      user.email || '', user.code || user.login_id || '', user.login_id || ''
    ]);
  }
  return crew;
}

// GET /api/projects - List projects (with pagination)
router.get('/', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let projects;
    let total;

    if (req.user.role === 'admin') {
      total = (await get('SELECT COUNT(*) as c FROM projects')).c;
      projects = await query(`
        SELECT p.*, u.name as client_name, u.email as client_email, u.company as client_company
        FROM projects p
        JOIN users u ON p.client_id = u.id
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } else if (req.user.role === 'crew') {
      const crew = await resolveCrew(req.user);
      if (!crew) {
        return res.json({ projects: [], total: 0, page, limit });
      }
      total = (await get('SELECT COUNT(*) as c FROM project_assignments WHERE crew_id = ?', [crew.id])).c;
      projects = await query(`
        SELECT p.*, u.name as client_name, u.email as client_email, u.company as client_company
        FROM projects p
        JOIN users u ON p.client_id = u.id
        JOIN project_assignments pa ON pa.project_id = p.id
        WHERE pa.crew_id = ?
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `, [crew.id, limit, offset]);
    } else {
      total = (await get('SELECT COUNT(*) as c FROM projects WHERE client_id = ?', [req.user.id])).c;
      projects = await query(
        'SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [req.user.id, limit, offset]
      );
    }

    projects = projects.map(p => ({ ...p, files: parseFiles(p.files) }));

    res.json({ projects, total, page, limit });
  } catch (err) {
    console.error('Projects list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id - Get single project
router.get('/:id', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const project = await get(`
      SELECT p.*, u.name as client_name, u.email as client_email, u.company as client_company
      FROM projects p
      JOIN users u ON p.client_id = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

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

    project.files = parseFiles(project.files);

    const msgCount = await get('SELECT COUNT(*) as count FROM messages WHERE project_id = ?', [project.id]);
    project.message_count = msgCount.count;

    const assignedCrew = await query(`
      SELECT cm.id, cm.name, cm.role, cm.code, cm.initials, cm.login_id, pa.role as assignment_role
      FROM project_assignments pa
      JOIN crew_members cm ON pa.crew_id = cm.id
      WHERE pa.project_id = ?
    `, [project.id]);
    project.assigned_crew_details = assignedCrew;

    res.json({ project });
  } catch (err) {
    console.error('Project detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects - Create project (client applies)
router.post('/', verifyToken, async (req, res) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { title, description, department, budget, timeline } = parsed.data;

    await getDatabase();
    const result = await run(`
      INSERT INTO projects (client_id, title, description, department, budget, timeline, status)
      VALUES (?, ?, ?, ?, ?, ?, 'applied')
    `, [req.user.id, title, description, department, budget, timeline]);

    const project = await get('SELECT * FROM projects WHERE id = ?', [result.lastId]);

    res.status(201).json({
      message: 'Project application submitted successfully',
      project
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/projects/:id - Update project (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { title, description, department, status, assigned_crew, budget, timeline, start_date, end_date } = parsed.data;
    await getDatabase();

    const existing = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (department !== undefined) { updates.push('department = ?'); params.push(department || ''); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (budget !== undefined) { updates.push('budget = ?'); params.push(budget || ''); }
    if (timeline !== undefined) { updates.push('timeline = ?'); params.push(timeline || ''); }
    if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date || ''); }
    if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date || ''); }

    updates.push(`updated_at = ${nowExpression()}`);

    if (updates.length > 0) {
      params.push(req.params.id);
      await run(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Handle crew assignment via join table
    if (assigned_crew !== undefined) {
      const crewIds = Array.isArray(assigned_crew)
        ? assigned_crew
        : (typeof assigned_crew === 'string' && assigned_crew.trim()
            ? assigned_crew.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
            : []);

      await run('DELETE FROM project_assignments WHERE project_id = ?', [req.params.id]);
      for (const crewId of [...new Set(crewIds)]) {
        await run('INSERT INTO project_assignments (project_id, crew_id, role) VALUES (?, ?, ?)', [req.params.id, crewId, '']);
      }
    }

    const updated = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
    updated.files = parseFiles(updated.files);
    res.json({ message: 'Project updated', project: updated });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/upload - Upload files to project
router.post('/:id/upload', verifyToken, upload.array('files', 5), async (req, res) => {
  try {
    await getDatabase();
    const project = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (req.user.role !== 'admin' && project.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const uploadedFiles = req.files.map(f => ({
      name: f.originalname,
      path: f.filename,
      size: f.size,
      uploaded_at: new Date().toISOString()
    }));

    const existingFiles = parseFiles(project.files);
    const allFiles = [...existingFiles, ...uploadedFiles];

    await run(`UPDATE projects SET files = ?, updated_at = ${nowExpression()} WHERE id = ?`, [
      JSON.stringify(allFiles), req.params.id
    ]);

    res.json({ message: 'Files uploaded', files: uploadedFiles });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id - Delete project (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const result = await run('DELETE FROM projects WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
