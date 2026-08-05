// ---------------------------------------------------------------------------
// src/config/db.js
// Database access layer — wraps the existing database.js driver shim.
// Re-exports the shared query helpers used by all controllers.
// ---------------------------------------------------------------------------
const {
  getDatabase,
  query,
  get,
  run,
  exec,
  transaction,
  isPostgres,
  nowExpression,
  saveDatabase,
  generateLoginId
} = require('../../database');

module.exports = {
  getDatabase,
  query,
  get,
  run,
  exec,
  transaction,
  isPostgres,
  nowExpression,
  saveDatabase,
  generateLoginId
};
