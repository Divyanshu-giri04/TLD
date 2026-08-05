// ---------------------------------------------------------------------------
// src/client/controllers/auth.controller.js
// Client authentication (register, login, me, API keys, password reset).
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, get, run, query, nowExpression } = require('../../config/db');
const { generateToken, verifyToken, verifyTokenOrApiKey } = require('../../middleware/auth');
const {
  registerSchema,
  loginSchema,
  generateKeySchema,
  forgotPasswordSchema,
  resetPasswordSchema
} = require('../schemas/auth.schema');

class AuthController {
  // POST /api/auth/register - Client registration
  static async register(req, res) {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { name, email, password, company, phone, address } = parsed.data;

      await getDatabase();
      const existing = await get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const result = await run(
        'INSERT INTO users (name, email, password, company, phone, address, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name, email, hashedPassword, company, phone, address, 'client']
      );
      const userId = result.lastId;

      // Generate API key for new client — attached to the REAL user id (audit 2.2)
      const apiKey = uuidv4();
      await run('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)', [userId, apiKey, 'Default']);

      const user = await get(
        'SELECT id, name, email, role, company, phone, address, created_at FROM users WHERE id = ?',
        [userId]
      );

      const token = generateToken(user);

      res.status(201).json({
        message: 'Registration successful',
        token,
        api_key: apiKey,
        user
      });
    } catch (err) {
      console.error('Register error:', err);
      if (err && err.constraint === 'users_email_key') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      res.status(500).json({ error: 'Server error during registration' });
    }
  }

  // POST /api/auth/login
  static async login(req, res) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { email, password } = parsed.data;

      await getDatabase();
      const user = await get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const validPassword = bcrypt.compareSync(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const apiKeys = await query('SELECT key, label, last_used FROM api_keys WHERE user_id = ?', [user.id]);

      const token = generateToken(user);
      const { password: _, ...userData } = user;

      res.json({
        message: 'Login successful',
        token,
        api_keys: apiKeys,
        user: userData
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Server error during login' });
    }
  }

  // GET /api/auth/me - Get current user (JWT or API key — audit 2.2)
  static async me(req, res) {
    try {
      await getDatabase();
      const user = await get(
        'SELECT id, name, email, role, company, phone, address, avatar, status, created_at FROM users WHERE id = ?',
        [req.user.id]
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const apiKeys = await query('SELECT id, key, label, last_used, created_at FROM api_keys WHERE user_id = ?', [user.id]);

      res.json({ user, api_keys: apiKeys });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/auth/generate-key - Generate new API key
  static async generateKey(req, res) {
    try {
      const parsed = generateKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { label } = parsed.data;
      const apiKey = uuidv4();
      await getDatabase();

      await run('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)', [req.user.id, apiKey, label]);

      res.status(201).json({
        message: 'API key generated',
        api_key: apiKey,
        label
      });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }

  // DELETE /api/auth/revoke-key/:id - Revoke API key
  static async revokeKey(req, res) {
    try {
      await getDatabase();
      const result = await run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      res.json({ message: 'API key revoked' });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/auth/forgot-password - Request password reset (clients)
  static async forgotPassword(req, res) {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { email } = parsed.data;

      await getDatabase();
      const user = await get('SELECT id, name, email FROM users WHERE email = ? AND role = ?', [email, 'client']);

      // Don't reveal existence
      if (!user) {
        return res.json({ message: 'If the account exists, a reset link has been sent.' });
      }

      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await run(
        'INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)',
        [token, user.id, expiresAt]
      );

      console.log(`\n  🔐 Password reset for client "${user.name}" (${user.email}):\n  Token: ${token}\n  POST /api/auth/reset-password { token, password: "..." }\n`);

      res.json({ message: 'If the account exists, a reset link has been sent.', reset_token: token });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // POST /api/auth/reset-password - Reset password with token
  static async resetPassword(req, res) {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { token, password } = parsed.data;

      await getDatabase();

      const resetToken = await get(
        `SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ${nowExpression()}`,
        [token]
      );

      if (!resetToken) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);

      if (resetToken.user_id) {
        // Client password reset
        await run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, resetToken.user_id]);
      } else if (resetToken.crew_id) {
        // Crew password reset
        await run('UPDATE crew_members SET password = ? WHERE id = ?', [hashedPassword, resetToken.crew_id]);
      } else {
        return res.status(400).json({ error: 'Invalid reset token' });
      }

      // Mark token as used
      await run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [resetToken.id]);

      res.json({ message: 'Password reset successful. You can now log in with your new password.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = AuthController;
