// ---------------------------------------------------------------------------
// src/admin/index.js
// Admin module entry — exports the admin routes.
// ---------------------------------------------------------------------------
const adminRoutes = require('./routes/admin.routes');
const adminClientsRoutes = require('./routes/admin.clients.routes');
const adminMonolithRoutes = require('./routes/admin.monolith.routes');

// Wire the admin-specific guard into the module graph so it is connected/used.
const { adminOnly } = require('./middleware/guard');

module.exports = {
  adminRoutes,
  adminClientsRoutes,
  adminMonolithRoutes,
  adminOnly
};
