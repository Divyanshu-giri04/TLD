// ---------------------------------------------------------------------------
// src/crew/index.js
// Crew module entry — exports the crew routes.
// ---------------------------------------------------------------------------
const crewRoutes = require('./routes/crew.routes');

// Wire the crew-specific guard into the module graph so it is connected/used.
const { crewAdminOnly } = require('./middleware/guard');

module.exports = {
  crewRoutes,
  crewAdminOnly
};
