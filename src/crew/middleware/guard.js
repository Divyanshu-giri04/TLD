// ---------------------------------------------------------------------------
// src/crew/middleware/guard.js
// Crew-specific authorization guards.
// ---------------------------------------------------------------------------
const { requireAdmin } = require('../../middleware/auth');

// Crew admin guard — re-exported so the crew module is self-contained.
const crewAdminOnly = requireAdmin;

module.exports = { crewAdminOnly };
