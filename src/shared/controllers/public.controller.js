// ---------------------------------------------------------------------------
// src/shared/controllers/public.controller.js
// Public endpoints: whitelisted settings and departments list.
// ---------------------------------------------------------------------------
const {
  getDatabase, query
} = require('../../config/db');

class PublicController {
  // GET /api/public/settings — whitelisted public settings (audit 2.5)
  static async settings(req, res) {
    try {
      await getDatabase();
      const rows = await query('SELECT key, value FROM site_settings');

      // Only expose a whitelist of safe, non-sensitive settings
      const ALLOWED_KEYS = [
        'company_name',
        'company_tagline',
        'company_email',
        'projects_shipped',
        'repeat_clients',
        'timezones',
        'crew_size'
      ];

      const settings = {};
      rows.forEach(s => {
        if (s && ALLOWED_KEYS.includes(s.key)) settings[s.key] = s.value;
      });

      res.json({ settings });
    } catch (err) {
      console.error('Public settings error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // GET /api/departments — public departments list (audit 2.5)
  static async departments(req, res) {
    try {
      await getDatabase();
      const departments = await query('SELECT code, title, description, head_count FROM departments ORDER BY code ASC');
      res.json({ departments });
    } catch (err) {
      console.error('Departments error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
}

module.exports = PublicController;
