const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase, prepare } = require('../database');
const { verifyToken, requireAdmin, generateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/crew - List all crew members (public - no password)
router.get('/', async (req, res) => {
  try {
    await getDatabase();
    const crew = prepare('SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, created_at FROM crew_members ORDER BY code ASC').all();
    res.json({ crew });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/crew/login - Crew member login
router.post('/login', async (req, res) => {
  try {
    const { email, password, code } = req.body;
    
    if ((!email && !code) || !password) {
      return res.status(400).json({ error: 'Email/Code and password are required' });
    }

    await getDatabase();
    
    let crewMember;
    if (email) {
      crewMember = prepare('SELECT * FROM crew_members WHERE email = ?').get(email);
    } else {
      crewMember = prepare('SELECT * FROM crew_members WHERE code = ?').get(code);
    }

    if (!crewMember) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password - support both bcrypt and plain text (for seeded defaults)
    let validPassword = false;
    if (crewMember.password) {
      if (crewMember.password.startsWith('$2')) {
        validPassword = bcrypt.compareSync(password, crewMember.password);
      } else {
        validPassword = password === crewMember.password;
      }
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password: _, ...crewData } = crewMember;
    
    // Generate JWT token with crew role
    const token = generateToken({
      id: crewMember.id,
      email: crewMember.email || crewMember.code + '@crew.tld',
      role: 'crew',
      name: crewMember.name
    });

    res.json({ message: 'Login successful', token, crew: crewData });
  } catch (err) {
    console.error('Crew login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/crew - Add crew member (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, role, code, initials, department, bio, portfolio_url, email, password } = req.body;

    if (!name || !role || !code || !initials || !department) {
      return res.status(400).json({ error: 'Name, role, code, initials, department are required' });
    }

    await getDatabase();
    const existing = prepare('SELECT id FROM crew_members WHERE code = ?').get(code);
    if (existing) {
      return res.status(409).json({ error: 'Crew code already exists' });
    }

    const hashedPass = password ? bcrypt.hashSync(password, 10) : '';

    prepare(`
      INSERT INTO crew_members (name, role, code, initials, department, bio, portfolio_url, email, password) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(name), String(role), String(code), String(initials),
      String(department), String(bio || ''), String(portfolio_url || ''),
      String(email || ''), hashedPass
    );

    const member = prepare('SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, created_at FROM crew_members ORDER BY id DESC LIMIT 1').get();
    res.status(201).json({ message: 'Crew member added', member });
  } catch (err) {
    console.error('Add crew error:', err);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Crew code already exists' });
    }
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// PUT /api/crew/:id - Update crew member (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, role, department, bio, portfolio_url, status, email, password } = req.body;
    await getDatabase();

    const existing = prepare('SELECT * FROM crew_members WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Crew member not found' });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (department) { updates.push('department = ?'); params.push(department); }
    if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
    if (portfolio_url !== undefined) { updates.push('portfolio_url = ?'); params.push(portfolio_url); }
    if (status) { updates.push('status = ?'); params.push(status); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (password) { 
      const hashedPass = bcrypt.hashSync(password, 10);
      updates.push('password = ?'); 
      params.push(hashedPass); 
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      prepare(`UPDATE crew_members SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const member = prepare('SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, created_at FROM crew_members WHERE id = ?').get(req.params.id);
    res.json({ message: 'Crew member updated', member });
  } catch (err) {
    console.error('Update crew error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// PUT /api/crew/:id/password - Change crew password (admin only)
router.put('/:id/password', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    await getDatabase();
    const existing = prepare('SELECT id FROM crew_members WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Crew member not found' });
    }

    const hashedPass = bcrypt.hashSync(password, 10);
    prepare('UPDATE crew_members SET password = ? WHERE id = ?').run(hashedPass, req.params.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Crew password error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// DELETE /api/crew/:id - Delete crew member (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await getDatabase();
    const result = prepare('DELETE FROM crew_members WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Crew member not found' });
    }

    res.json({ message: 'Crew member deleted' });
  } catch (err) {
    console.error('Delete crew error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET /api/crew/projects - Get assigned projects for logged in crew
router.get('/projects', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'crew' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    await getDatabase();
    
    // Get crew member by email or name
    let crewMember = prepare('SELECT * FROM crew_members WHERE email = ?').get(req.user.email);
    if (!crewMember) {
      crewMember = prepare('SELECT * FROM crew_members WHERE name = ?').get(req.user.name);
    }

    if (!crewMember && req.user.role === 'admin') {
      // Admin sees all projects
      const projects = prepare(`
        SELECT p.*, u.name as client_name, u.email as client_email 
        FROM projects p 
        JOIN users u ON p.client_id = u.id 
        ORDER BY p.created_at DESC
      `).all();
      return res.json({ projects: projects.map(p => ({...p, files: p.files ? JSON.parse(p.files) : []})) });
    }

    if (!crewMember) {
      return res.status(404).json({ error: 'Crew member profile not found' });
    }

    // Find projects where assigned_crew contains this crew member's name or code
    const allProjects = prepare(`
      SELECT p.*, u.name as client_name, u.email as client_email 
      FROM projects p 
      JOIN users u ON p.client_id = u.id 
      ORDER BY p.created_at DESC
    `).all();

    const assigned = allProjects.filter(p => {
      if (!p.assigned_crew) return false;
      try {
        const crewList = typeof p.assigned_crew === 'string' 
          ? JSON.parse(p.assigned_crew) 
          : p.assigned_crew;
        return crewList.some(c => 
          c.id === crewMember.id || 
          c.code === crewMember.code || 
          c.name === crewMember.name
        );
      } catch {
        return p.assigned_crew.includes(crewMember.name) || 
               p.assigned_crew.includes(crewMember.code);
      }
    });

    res.json({ projects: assigned.map(p => ({...p, files: p.files ? JSON.parse(p.files) : []})) });
  } catch (err) {
    console.error('Crew projects error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

module.exports = router;
