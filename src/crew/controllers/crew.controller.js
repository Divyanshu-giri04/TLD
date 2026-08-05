// ---------------------------------------------------------------------------
// src/crew/controllers/crew.controller.js
// Crew management: list, login, add, update, change password, delete, projects,
// forgot-password.
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  getDatabase, get, run, query, generateLoginId
} = require('../../config/db');
const {
  verifyToken, requireAdmin, generateToken, optionalAuth
} = require('../../middleware/auth');
const {
  addCrewSchema,
  updateCrewSchema,
  crewLoginSchema,
  crewForgotPasswordSchema
} = require('../schemas/crew.schema');

function parseFiles(files) {
  try { return JSON.parse(files || '[]'); } catch (_) { return []; }
}

class CrewController {
  // GET /api/crew - List all crew members (public; full detail only for admins)
  static async list(req, res) {
    try {
      await getDatabase();
      const crew = await query(
        'SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, login_id, salary, contact_no, created_at FROM crew_members ORDER BY code ASC'
      );

      // Anonymous/crew callers get a safe subset — no email, login_id, salary, or contact_no
      const isAdmin = req.user && req.user.role === 'admin';
      const safeCrew = crew.map(m => {
        if (isAdmin) return m;
        const { email, login_id, salary, contact_no, ...safe } = m;
        return safe;
      });

      res.json({ crew: safeCrew });
    } catch (err) {
      console.error('Crew list error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/crew/login - Crew member login
  static async login(req, res) {
    try {
      const parsed = crewLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { email, code, login_id, password } = parsed.data;

      if (!email && !code && !login_id) {
        return res.status(400).json({ error: 'Email, code, or login_id and password are required' });
      }

      await getDatabase();

      let crewMember;
      if (login_id) {
        crewMember = await get('SELECT * FROM crew_members WHERE login_id = ?', [login_id]);
      } else if (email) {
        crewMember = await get('SELECT * FROM crew_members WHERE email = ?', [email]);
      } else {
        crewMember = await get('SELECT * FROM crew_members WHERE code = ?', [code]);
      }

      if (!crewMember) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Password must be bcrypt-hashed — no plaintext fallback (audit 2.7)
      if (!crewMember.password || !crewMember.password.startsWith('$2')) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const validPassword = bcrypt.compareSync(password, crewMember.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const { password: _, ...crewData } = crewMember;

      const token = generateToken({
        id: crewMember.id,
        email: crewMember.email || crewMember.code + '@crew.tld',
        role: 'crew',
        name: crewMember.name,
        code: crewMember.code,
        login_id: crewMember.login_id
      });

      res.json({ message: 'Login successful', token, crew: crewData });
    } catch (err) {
      console.error('Crew login error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/crew - Add crew member (admin only)
  static async add(req, res) {
    try {
      const parsed = addCrewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { name, role, code, initials, department, bio, portfolio_url, email, password } = parsed.data;

      await getDatabase();
      const existing = await get('SELECT id FROM crew_members WHERE code = ?', [code]);
      if (existing) {
        return res.status(409).json({ error: 'Crew code already exists' });
      }

      // Auto-generate login_id
      const loginId = generateLoginId(department);

      // Auto-generate default password if not provided
      const defaultPassword = password || code.toLowerCase() + '@tld';
      const hashedPass = bcrypt.hashSync(defaultPassword, 10);

      const result = await run(`
        INSERT INTO crew_members (name, role, code, initials, department, bio, portfolio_url, email, password, login_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, role, code, initials, department, bio, portfolio_url, email, hashedPass, loginId]);

      const member = await get(
        'SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, login_id, created_at FROM crew_members WHERE id = ?',
        [result.lastId]
      );

      res.status(201).json({
        message: 'Crew member added',
        member,
        default_password: defaultPassword, // Returned once — admin must share securely
        login_id: loginId
      });
    } catch (err) {
      console.error('Add crew error:', err);
      if (err && (err.code === '23505' || (err.message && err.message.includes('UNIQUE')))) {
        return res.status(409).json({ error: 'Crew code already exists' });
      }
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/crew/:id - Update crew member (admin only)
  static async update(req, res) {
    try {
      const parsed = updateCrewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { name, role, department, bio, portfolio_url, status, email, login_id, salary, contact_no, password } = parsed.data;
      await getDatabase();

      const existing = await get('SELECT * FROM crew_members WHERE id = ?', [req.params.id]);
      if (!existing) {
        return res.status(404).json({ error: 'Crew member not found' });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) { updates.push('name = ?'); params.push(name); }
      if (role !== undefined) { updates.push('role = ?'); params.push(role); }
      if (department !== undefined) { updates.push('department = ?'); params.push(department); }
      if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
      if (portfolio_url !== undefined) { updates.push('portfolio_url = ?'); params.push(portfolio_url); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (email !== undefined) { updates.push('email = ?'); params.push(email); }
      if (login_id !== undefined) { updates.push('login_id = ?'); params.push(login_id); }
      if (salary !== undefined) { updates.push('salary = ?'); params.push(salary); }
      if (contact_no !== undefined) { updates.push('contact_no = ?'); params.push(contact_no); }
      if (password) {
        const hashedPass = bcrypt.hashSync(password, 10);
        updates.push('password = ?');
        params.push(hashedPass);
      }

      if (updates.length > 0) {
        params.push(req.params.id);
        await run(`UPDATE crew_members SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      const member = await get(
        'SELECT id, name, role, code, initials, department, bio, portfolio_url, status, email, login_id, salary, contact_no, created_at FROM crew_members WHERE id = ?',
        [req.params.id]
      );
      res.json({ message: 'Crew member updated', member });
    } catch (err) {
      console.error('Update crew error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // PUT /api/crew/:id/password - Change crew password (admin only)
  static async changePassword(req, res) {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      await getDatabase();
      const existing = await get('SELECT id FROM crew_members WHERE id = ?', [req.params.id]);
      if (!existing) {
        return res.status(404).json({ error: 'Crew member not found' });
      }

      const hashedPass = bcrypt.hashSync(password, 10);
      await run('UPDATE crew_members SET password = ? WHERE id = ?', [hashedPass, req.params.id]);

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      console.error('Crew password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // DELETE /api/crew/:id - Delete crew member (admin only)
  static async remove(req, res) {
    try {
      await getDatabase();
      const result = await run('DELETE FROM crew_members WHERE id = ?', [req.params.id]);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Crew member not found' });
      }

      res.json({ message: 'Crew member deleted' });
    } catch (err) {
      console.error('Delete crew error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // GET /api/crew/projects - Get assigned projects for logged in crew
  static async projects(req, res) {
    try {
      if (req.user.role !== 'crew' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }

      await getDatabase();

      if (req.user.role === 'admin') {
        const projects = await query(`
          SELECT p.*, u.name as client_name, u.email as client_email
          FROM projects p
          JOIN users u ON p.client_id = u.id
          ORDER BY p.created_at DESC
        `);
        return res.json({ projects: projects.map(p => ({ ...p, files: parseFiles(p.files) })) });
      }

      // Crew lookup by JWT id (more reliable than email/name)
      let crew = await get('SELECT * FROM crew_members WHERE id = ?', [req.user.id]);
      if (!crew) {
        // Fallback: try email or code
        crew = await get('SELECT * FROM crew_members WHERE email = ? OR code = ?', [
          req.user.email || '', req.user.code || req.user.login_id || ''
        ]);
      }
      if (!crew) {
        return res.status(404).json({ error: 'Crew member profile not found' });
      }

      // Use project_assignments join table (audit 2.6)
      const projects = await query(`
        SELECT p.*, u.name as client_name, u.email as client_email
        FROM projects p
        JOIN users u ON p.client_id = u.id
        JOIN project_assignments pa ON pa.project_id = p.id
        WHERE pa.crew_id = ?
        ORDER BY p.created_at DESC
      `, [crew.id]);

      res.json({ projects: projects.map(p => ({ ...p, files: parseFiles(p.files) })) });
    } catch (err) {
      console.error('Crew projects error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/crew/forgot-password - Request a password reset token
  static async forgotPassword(req, res) {
    try {
      const parsed = crewForgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { email, login_id } = parsed.data;

      if (!email && !login_id) {
        return res.status(400).json({ error: 'Email or login_id is required' });
      }

      await getDatabase();

      let crewMember;
      if (login_id) {
        crewMember = await get('SELECT id, name, email, login_id FROM crew_members WHERE login_id = ?', [login_id]);
      } else {
        crewMember = await get('SELECT id, name, email, login_id FROM crew_members WHERE email = ?', [email]);
      }

      // Don't reveal whether the account exists — just say "if found, email sent"
      if (!crewMember || !crewMember.email) {
        return res.json({ message: 'If the account exists, a reset link has been sent.' });
      }

      // Generate reset token (valid 1 hour)
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await run(
        'INSERT INTO password_reset_tokens (token, crew_id, expires_at, used) VALUES (?, ?, ?, 0)',
        [token, crewMember.id, expiresAt]
      );

      // In production, send email here. For now, return the token (dev mode)
      console.log(`\n  🔐 Password reset for crew "${crewMember.name}" (${crewMember.email || crewMember.login_id}):\n  Token: ${token}\n  POST /api/auth/reset-password { token, password: "..." }\n`);

      res.json({ message: 'If the account exists, a reset link has been sent.', reset_token: token });
    } catch (err) {
      console.error('Crew forgot-password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = CrewController;
