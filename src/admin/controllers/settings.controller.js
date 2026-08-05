// ---------------------------------------------------------------------------
// src/admin/controllers/settings.controller.js
// Admin site settings.
// ---------------------------------------------------------------------------
const { getDatabase, get, run, query } = require('../../config/db');

class SettingsController {
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
}

module.exports = SettingsController;
