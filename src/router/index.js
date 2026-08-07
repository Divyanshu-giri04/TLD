// ---------------------------------------------------------------------------
// src/router/index.js
// Route aggregator — mirrors the `node setup` src/router/index.ts pattern.
// Aggregates all role modules (admin, client, crew) plus shared/public routes.
// ---------------------------------------------------------------------------
const { adminRoutes, adminClientsRoutes, adminMonolithRoutes } = require('../admin');
const { clientRoutes } = require('../client');
const { crewRoutes } = require('../crew');
const { sharedRoutes } = require('../shared');

function initRoutes(app) {
  // Admin panel APIs
  app.use('/api/admin', adminRoutes);

  // Monolithic AdminController (legacy) — mounted separately to avoid conflicts
  app.use('/api/admin/legacy', adminMonolithRoutes);

  // Admin-managed client management (mounted at /api/clients)
  app.use('/api/clients', adminClientsRoutes);

  // Client/auth/project/message APIs (mounted base)
  app.use('/api', clientRoutes);

  // Crew APIs
  app.use('/api/crew', crewRoutes);

  // Shared/public APIs
  app.use('/api', sharedRoutes);
}

module.exports = { initRoutes };
