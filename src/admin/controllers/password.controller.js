// ---------------------------------------------------------------------------
// src/admin/controllers/password.controller.js
// Admin password reset for any user/crew.
// ---------------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const { getDatabase, get, run } = require('../../config/db');
const { z } = require('zod');

const adminResetPasswordSchema = z.object({
  type: z.enum(['client', 'crew', 'admin'], { error: 'target type is client, crew, or admin' }),
  email: z.string().email('Valid email required'),
  new_password: z.string().min(6, 'Password must be at least 6 characters').max(200)
});

class PasswordController {
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
}

module.exports = PasswordController;
