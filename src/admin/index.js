// ---------------------------------------------------------------------------
// src/admin/index.js
// Admin module entry — exports the admin routes.
// ---------------------------------------------------------------------------
const adminRoutes = require('./routes/admin.routes');
const adminClientsRoutes = require('./routes/admin.clients.routes');

module.exports = {
  adminRoutes,
  adminClientsRoutes
};
