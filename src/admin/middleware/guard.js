// ---------------------------------------------------------------------------
// src/admin/middleware/guard.js
// Admin-specific authorization guards.
// ---------------------------------------------------------------------------
const { requireAdmin } = require('../../middleware/auth');

// Admin-only guard — re-exported so the admin module is self-contained.
const adminOnly = requireAdmin;

module.exports = { adminOnly };
