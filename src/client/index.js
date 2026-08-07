// ---------------------------------------------------------------------------
// src/client/index.js
// Client module entry — exports the client routes.
// ---------------------------------------------------------------------------
const clientRoutes = require('./routes/client.routes');

// Wire the client-specific guard into the module graph so it is connected/used.
const { clientOnly } = require('./middleware/guard');

module.exports = {
  clientRoutes,
  clientOnly
};
