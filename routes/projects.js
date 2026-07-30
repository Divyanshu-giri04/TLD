const express = require('express');
const { getDatabase, prepare } = require('../database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// GET /api/projects - List projects
router.get('/', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    let projects;

    if (req.user.role === 'admin') {
      projects = prepare(`
        SELECT p.*, u.name as client_name, u.email as client_email, u.company as client_company
        FROM projects p 
        JOIN users u ON p.client_id = u.id 
        ORDER BY p.created_at DESC
      `).all();
    } else {
      projects = prepare(`
        SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC
      `).all(req.user.id);
    }

    // Parse files JSON
    projects = projects.map(p => ({
      ...p,
      files: p.files ? JSON.parse(p.files) : []
    }));

    res.json({ projects });
  } catch (err) {
    console.error('Projects list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/projects/:id - Get single project
router.get('/:id', verifyToken, async (req, res) => {
  try {
    await getDatabase();
    const project = prepare(`
      SELECT p.*, u.name as client_name, u.email as client_email, u.company as client_company
      FROM projects p 
      JOIN users u ON p.client_id = u.id 
      WHERE p.id = ?
    `).get(req.params.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check access
    if (req.user.role !== 'admin' && project.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    project.files = project.files ? JSON.parse(project.files) : [];

    // Get messages count
    const msgCount = prepare('SELECT COUNT(*) as count FROM messages WHERE project_id = ?').get(project.id);
    project.message_count = msgCount.count;

    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects - Create project (client applies)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, description, department, budget, timeline } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    await getDatabase();
    prepare(`
      INSERT INTO projects (client_id, title, description, department, budget, timeline, status) 
      VALUES (?, ?, ?, ?, ?, ?, 'applied')
    `).run(req.user.id, title, description, department || '', budget || '', timeline || '');

    const project = prepare('SELECT * FROM projects ORDER BY id DESC LIMIT 1').get();

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
    const { title, description, department, status, assigned_crew, budget, timeline } = req.body;
    await getDatabase();

    const existing = prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Serialize assigned_crew to JSON if it's an array
    let crewStr = existing.assigned_crew;
    if (assigned_crew) {
      crewStr = typeof assigned_crew === 'string' ? assigned_crew : JSON.stringify(assigned_crew);
    }

    prepare(`
      UPDATE projects SET 
        title = ?,
        description = ?,
        department = ?,
        status = ?,
        assigned_crew = ?,
        budget = ?,
        timeline = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(
      title || existing.title,
      description || existing.description,
      department || existing.department,
      status || existing.status,
      crewStr,
      budget || existing.budget,
      timeline || existing.timeline,
      req.params.id
    );

    const updated = prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ message: 'Project updated', project: updated });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/projects/:id/upload - Upload files to project
router.post('/:id/upload', verifyToken, upload.array('files', 5), async (req, res) => {
  try {
    await getDatabase();
    const project = prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);

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

    const existingFiles = project.files ? JSON.parse(project.files) : [];
    const allFiles = [...existingFiles, ...uploadedFiles];

    prepare('UPDATE projects SET files = ?, updated_at = datetime("now","localtime") WHERE id = ?').run(
      JSON.stringify(allFiles), req.params.id
    );

    res.json({ message: 'Files uploaded', files: uploadedFiles });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/projects/:id - Delete project (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const result = prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

