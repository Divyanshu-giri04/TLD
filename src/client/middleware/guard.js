// ---------------------------------------------------------------------------
// src/client/middleware/guard.js
// Client-specific authorization guards.
// ---------------------------------------------------------------------------
const { requireClient } = require('../../middleware/auth');

// Client-only guard — re-exported so the client module is self-contained.
const clientOnly = requireClient;

module.exports = { clientOnly };
