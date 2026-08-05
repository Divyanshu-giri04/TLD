// ---------------------------------------------------------------------------
// src/config/db.js
// Unified database access layer.
//
//  1. If MONGODB_URI is set AND reachable, the app uses MongoDB (Mongoose).
//  2. Otherwise it falls back to the existing SQL shim (SQLite or Postgres),
//     so the server always boots and existing data keeps working.
//
// The exported get / run / query / exec / transaction helpers transparently
// route to MongoDB (via the SQL translator) when Mongo is active, or to the
// SQL shim otherwise. This keeps all existing controllers unchanged.
// ---------------------------------------------------------------------------
const mongoose = require('mongoose');

const sql = require('../../database');
const { mongoQuery, runTransaction } = require('./mongoQuery');

let mongoDriver = false;
let mongoConnected = false;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/thelaunchdesk';

async function connectMongo() {
  if (mongoConnected) return true;
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500
    });
    mongoConnected = true;
    console.log('  ✅ MongoDB connected  → ' + MONGODB_URI);
    // Seed default data (admin/departments/crew/settings) if empty
    try {
      const { seedMongo } = require('./seed');
      await seedMongo();
    } catch (seedErr) {
      console.warn('  ⚠️  Mongo seed skipped (' + (seedErr && seedErr.message ? seedErr.message : seedErr) + ')');
    }
    return true;
  } catch (err) {
    mongoConnected = false;
    console.warn('  ⚠️  MongoDB not reachable (' + (err && err.message ? err.message : err) + ')');
    console.warn('     Falling back to built-in SQL database.');
    return false;
  }
}

async function getDatabase() {
  if (mongoDriver) return 'mongo';

  // Try MongoDB first (only if MONGODB_URI is explicitly enabled).
  if (process.env.MONGODB_URI) {
    const ok = await connectMongo();
    if (ok) {
      mongoDriver = true;
      return 'mongo';
    }
  }

  // Fall back to SQL (SQLite default / Postgres if DATABASE_URL set).
  await sql.getDatabase();
  return sql.isPostgres() ? 'pg' : 'sqlite';
}

function isMongo() {
  return mongoDriver === true;
}

// Load models lazily.
let _models = null;
function mongoModels() {
  if (!_models) _models = require('./models');
  return _models;
}

// ---- Routed helpers (controllers call these) ----

async function query(q, params = []) {
  if (isMongo()) {
    // Convert to a plain array of objects (mongodb returns lean docs).
    try { return await mongoQuery(q, params); } catch (e) { console.error('mongoQuery SELECT error:', e.message, '\nSQL:', q); throw e; }
  }
  return sql.query(q, params);
}

async function get(q, params = []) {
  if (isMongo()) {
    try {
      const rows = await mongoQuery(q, params);
      return rows && rows[0] ? rows[0] : null;
    } catch (e) { console.error('mongoQuery GET error:', e.message, '\nSQL:', q); throw e; }
  }
  return sql.get(q, params);
}

async function run(q, params = []) {
  if (isMongo()) {
    try { return await mongoQuery(q, params); } catch (e) { console.error('mongoQuery RUN error:', e.message, '\nSQL:', q); throw e; }
  }
  return sql.run(q, params);
}

async function exec(q) {
  if (isMongo()) {
    try { return await mongoQuery(q); } catch (e) { console.error('mongoQuery EXEC error:', e.message, '\nSQL:', q); throw e; }
  }
  return sql.exec(q);
}

async function transaction(fn) {
  if (isMongo()) return runTransaction(fn);
  return sql.transaction(fn);
}

module.exports = {
  getDatabase,
  isMongo,
  mongoModels,
  // Routed helpers
  query,
  get,
  run,
  exec,
  transaction,
  // SQL helpers (still available for the SQL fallback path)
  getDatabaseSql: sql.getDatabase,
  isPostgres: sql.isPostgres,
  nowExpression: sql.nowExpression,
  saveDatabase: sql.saveDatabase,
  generateLoginId: sql.generateLoginId
};
