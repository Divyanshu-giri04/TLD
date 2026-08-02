const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'tld.db');
const DATABASE_URL = process.env.DATABASE_URL || '';

let db = null; // sql.js instance (fallback driver)
let pool = null; // pg Pool (primary driver)
let driver = null; // 'pg' | 'sqlite'
let txClient = null; // active transaction client (pg)

function isPostgres() {
  return driver === 'pg';
}

// ---------------------------------------------------------------------------
// Department → login_id prefix mapping
//   LEAD=1, DEV=2–9, MKT=10–19, HR=20–29, SUPPORT=30–40, OPS=41–49
// ---------------------------------------------------------------------------
const DEPT_LOGIN_PREFIX = {
  LEAD: 1,
  DEV: 2,
  MKT: 10,
  HR: 20,
  SUPPORT: 30,
  OPS: 41
};

function generateLoginId(department) {
  const prefix = DEPT_LOGIN_PREFIX[department] || 99;
  const suffix = String(Math.floor(Math.random() * 900) + 100); // 100–999
  return `TLD${prefix}${suffix}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Convert sqlite "?" placeholders to postgres "$1, $2, ..." (skips quoted strings)
function convertPlaceholders(sql) {
  let out = '';
  let count = 0;
  let inStr = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inStr) {
      out += ch;
      if (ch === inStr && sql[i - 1] !== '\\') inStr = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      inStr = ch;
      out += ch;
    } else if (ch === '?') {
      count++;
      out += `$${count}`;
    } else {
      out += ch;
    }
  }
  return out;
}

// Driver-aware "now" expression for timestamps/expiry comparisons.
// Postgres accepts CURRENT_TIMESTAMP; SQLite needs datetime('now','localtime').
// Always embed this via SQL-string interpolation (never user input).
function nowExpression() {
  return driver === 'pg' ? 'CURRENT_TIMESTAMP' : "datetime('now','localtime')";
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function getDatabase() {
  if (driver) return driver;

  if (DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: DATABASE_URL });
    driver = 'pg';
    await initPostgres();
  } else {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    driver = 'sqlite';
    initSqliteTables();
    await seedDefaults();
    await backfillCrewLoginIds();
    saveDatabase();
  }

  return driver;
}

// ---------------------------------------------------------------------------
// Postgres
// ---------------------------------------------------------------------------

async function initPostgres() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','client')) DEFAULT 'client',
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT 'Default',
      last_used TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS crew_members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      initials TEXT NOT NULL,
      department TEXT NOT NULL,
      bio TEXT DEFAULT '',
      portfolio_url TEXT DEFAULT '',
      status TEXT DEFAULT 'ON DECK',
      email TEXT DEFAULT '',
      password TEXT DEFAULT '',
      login_id TEXT UNIQUE,
      salary TEXT DEFAULT '',
      contact_no TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      head_count INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      department TEXT DEFAULT '',
      status TEXT CHECK(status IN ('applied','discovery','in_progress','review','completed','cancelled')) DEFAULT 'applied',
      assigned_crew TEXT DEFAULT '',
      budget TEXT DEFAULT '',
      timeline TEXT DEFAULT '',
      files TEXT DEFAULT '[]',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL,
      sender_role TEXT CHECK(sender_role IN ('client','admin','crew')) DEFAULT 'client',
      content TEXT NOT NULL,
      attachment TEXT DEFAULT '',
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS project_assignments (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      crew_id INTEGER NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
      role TEXT DEFAULT '',
      UNIQUE(project_id, crew_id)
    );
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      team_name TEXT NOT NULL,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      crew_id INTEGER NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, crew_id)
    );
    CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY,
      server_name TEXT NOT NULL,
      ip TEXT DEFAULT '',
      port TEXT DEFAULT '',
      client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      crew_id INTEGER REFERENCES crew_members(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0
    );
  `);

  await migratePostgres();
  await seedDefaults();
  await backfillCrewLoginIds();
}

async function migratePostgres() {
  // Add columns that may be missing on existing deployments
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'crew_members'
  `);
  const existing = cols.rows.map(r => r.column_name);

  if (!existing.includes('login_id')) {
    await pool.query('ALTER TABLE crew_members ADD COLUMN login_id TEXT UNIQUE');
  }
  if (!existing.includes('salary')) {
    await pool.query('ALTER TABLE crew_members ADD COLUMN salary TEXT DEFAULT \'\'');
  }
  if (!existing.includes('contact_no')) {
    await pool.query('ALTER TABLE crew_members ADD COLUMN contact_no TEXT DEFAULT \'\'');
  }

  const projCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'projects'
  `);
  const pExisting = projCols.rows.map(r => r.column_name);
  if (!pExisting.includes('start_date')) {
    await pool.query('ALTER TABLE projects ADD COLUMN start_date TEXT DEFAULT \'\'');
  }
  if (!pExisting.includes('end_date')) {
    await pool.query('ALTER TABLE projects ADD COLUMN end_date TEXT DEFAULT \'\'');
  }

  const userCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users'
  `);
  const uExisting = userCols.rows.map(r => r.column_name);
  if (!uExisting.includes('address')) {
    await pool.query('ALTER TABLE users ADD COLUMN address TEXT DEFAULT \'\'');
  }
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

function saveDatabase() {
  if (db) {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }
}

function initSqliteTables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','client')) DEFAULT 'client',
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT 'Default',
      last_used TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS crew_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      initials TEXT NOT NULL,
      department TEXT NOT NULL,
      bio TEXT DEFAULT '',
      portfolio_url TEXT DEFAULT '',
      status TEXT DEFAULT 'ON DECK',
      email TEXT DEFAULT '',
      password TEXT DEFAULT '',
      login_id TEXT UNIQUE,
      salary TEXT DEFAULT '',
      contact_no TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )`,
    `CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      head_count INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      department TEXT DEFAULT '',
      status TEXT CHECK(status IN ('applied','discovery','in_progress','review','completed','cancelled')) DEFAULT 'applied',
      assigned_crew TEXT DEFAULT '',
      budget TEXT DEFAULT '',
      timeline TEXT DEFAULT '',
      files TEXT DEFAULT '[]',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT CHECK(sender_role IN ('client','admin','crew')) DEFAULT 'client',
      content TEXT NOT NULL,
      attachment TEXT DEFAULT '',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS project_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      crew_id INTEGER NOT NULL,
      role TEXT DEFAULT '',
      UNIQUE(project_id, crew_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (crew_id) REFERENCES crew_members(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      team_name TEXT NOT NULL,
      client_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL,
      crew_id INTEGER NOT NULL,
      PRIMARY KEY (team_id, crew_id),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (crew_id) REFERENCES crew_members(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      ip TEXT DEFAULT '',
      port TEXT DEFAULT '',
      client_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT ''
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      crew_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    )`
  ];
  for (const sql of statements) {
    db.run(sql);
  }
  migrateSqlite();
}

// SQLite migration — add columns to existing tables
function migrateSqlite() {
  try {
    // Check crew_members columns
    const crewCols = db.exec("PRAGMA table_info(crew_members)");
    if (crewCols.length > 0) {
      const existing = crewCols[0].values.map(row => row[1]);
      if (!existing.includes('login_id')) {
        db.run("ALTER TABLE crew_members ADD COLUMN login_id TEXT");
      }
      if (!existing.includes('salary')) {
        db.run("ALTER TABLE crew_members ADD COLUMN salary TEXT DEFAULT ''");
      }
      if (!existing.includes('contact_no')) {
        db.run("ALTER TABLE crew_members ADD COLUMN contact_no TEXT DEFAULT ''");
      }
    }
  } catch (_) { /* table may not exist yet */ }

  try {
    const projCols = db.exec("PRAGMA table_info(projects)");
    if (projCols.length > 0) {
      const existing = projCols[0].values.map(row => row[1]);
      if (!existing.includes('start_date')) {
        db.run("ALTER TABLE projects ADD COLUMN start_date TEXT DEFAULT ''");
      }
      if (!existing.includes('end_date')) {
        db.run("ALTER TABLE projects ADD COLUMN end_date TEXT DEFAULT ''");
      }
    }
  } catch (_) {}

  try {
    const userCols = db.exec("PRAGMA table_info(users)");
    if (userCols.length > 0) {
      const existing = userCols[0].values.map(row => row[1]);
      if (!existing.includes('address')) {
        db.run("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''");
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Backfill login_id for existing crew members (both drivers)
// ---------------------------------------------------------------------------

async function backfillCrewLoginIds() {
  try {
    const rows = await query('SELECT id, department, login_id FROM crew_members');
    for (const row of rows) {
      if (!row.login_id) {
        const loginId = generateLoginId(row.department);
        // Ensure uniqueness
        let retries = 0;
        let lid = loginId;
        while (retries < 10) {
          const dup = await get('SELECT id FROM crew_members WHERE login_id = ?', [lid]);
          if (!dup) break;
          lid = generateLoginId(row.department);
          retries++;
        }
        await run('UPDATE crew_members SET login_id = ? WHERE id = ?', [lid, row.id]);
      }
    }
  } catch (_) {
    // Table may not exist yet; ignore
  }
}

// ---------------------------------------------------------------------------
// Query API (shared by both drivers)
// ---------------------------------------------------------------------------

async function query(sql, params = []) {
  if (!driver) await getDatabase();
  if (driver === 'pg') {
    const client = txClient || pool;
    const result = await client.query(convertPlaceholders(sql), params);
    return result.rows;
  }
  const stmt = db.prepare(sql);
  const results = [];
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

async function get(sql, params = []) {
  if (!driver) await getDatabase();
  if (driver === 'pg') {
    const client = txClient || pool;
    const result = await client.query(convertPlaceholders(sql), params);
    return result.rows[0];
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

async function run(sql, params = []) {
  if (!driver) await getDatabase();
  if (driver === 'pg') {
    let text = convertPlaceholders(sql);
    const isInsert = /^\s*INSERT/i.test(text) && !/RETURNING/i.test(text);
    if (isInsert) {
      text = text.replace(/;\s*$/, '') + ' RETURNING id';
    }
    const client = txClient || pool;
    const result = await client.query(text, params);
    return {
      changes: result.rowCount,
      lastId: result.rows && result.rows[0] ? result.rows[0].id : null
    };
  }
  const stmt = db.prepare(sql);
  stmt.run(params);
  const changes = db.getRowsModified();
  stmt.free();
  let lastId = null;
  if (/^\s*INSERT/i.test(sql)) {
    const idStmt = db.prepare('SELECT last_insert_rowid() AS id');
    idStmt.step();
    const row = idStmt.getAsObject();
    idStmt.free();
    lastId = row.id;
  }
  saveDatabase();
  return { changes, lastId };
}

async function exec(sql) {
  if (!driver) await getDatabase();
  if (driver === 'pg') {
    const client = txClient || pool;
    await client.query(sql);
    return;
  }
  db.run(sql);
  saveDatabase();
}

async function transaction(fn) {
  if (!driver) await getDatabase();
  if (driver === 'pg') {
    const client = await pool.connect();
    txClient = client;
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      txClient = null;
      client.release();
    }
  }
  db.run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    db.run('COMMIT');
    saveDatabase();
    return result;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seedDefaults() {
  // Admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thelaunchdesk.io';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2026';
  const existingAdmin = await get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (!existingAdmin) {
    const hashedPass = bcrypt.hashSync(adminPass, 10);
    await run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [
      'Admin', adminEmail, hashedPass, 'admin'
    ]);
  }

  // Departments
  const departments = [
    { code: 'LEAD', title: 'Direction', desc: 'Sets scope, owns the final call on anything client-facing, and steps in wherever a desk needs backup.', count: 1 },
    { code: 'DEV', title: 'Development', desc: 'Websites, web apps, and internal tools, built and shipped by two developers who pair on anything non-trivial.', count: 2 },
    { code: 'OPS', title: 'Client & People Management', desc: 'Keeping clients briefed, contracts clear, and the crew workload sane.', count: 2 },
    { code: 'MKT', title: 'Marketing & Growth', desc: 'Positioning, outreach, and the portfolio you are reading right now.', count: 1 },
    { code: 'SUPPORT', title: 'General Support', desc: 'The desk anyone can reach for help mid-project — questions, small fixes.', count: 1 },
    { code: 'HR', title: 'HR', desc: 'Collaboration and pair-programming mindset are essential.', count: 1 }
  ];
  for (const dept of departments) {
    const existing = await get('SELECT id FROM departments WHERE code = ?', [dept.code]);
    if (!existing) {
      await run('INSERT INTO departments (code, title, description, head_count) VALUES (?, ?, ?, ?)', [
        dept.code, dept.title, dept.desc, dept.count
      ]);
    }
  }

  // Crew members
  const crew = [
    { name: 'Dhruv Kr. Rao', role: 'Founder & Team Lead', code: 'LEAD-01', initials: 'DKR', dept: 'LEAD', bio: 'Sets direction, signs off on scope, and takes the calls nobody else wants to.', url: 'https://dhruv-kumar-rao.vercel.app/' },
    { name: 'Divya Mali', role: 'Full-Stack Developer', code: 'DEV-01', initials: 'DM', dept: 'DEV', bio: 'Owns front-end builds and the parts of the stack clients actually click on.', url: 'https://divya-mali-dev.vercel.app/#projects' },
    { name: 'Divyanshu Giri', role: 'Backend & Infra Developer', code: 'DEV-02', initials: 'DG', dept: 'DEV', bio: 'Keeps the servers, data, and integrations quietly working in the background.', url: 'https://backenddg.netlify.app/' },
    { name: 'Manthan Sahu', role: 'Client Relations & HR', code: 'HR-01', initials: 'MS', dept: 'HR', bio: 'First point of contact for clients, and the one who onboards new crew members.', url: 'https://manthan-portfolio-pink.vercel.app/' },
    { name: 'Aditya Sinha', role: 'People & Client Management', code: 'OPS-01', initials: 'AS', dept: 'OPS', bio: 'Handles contracts, timelines, and making sure nobody is overbooked.', url: 'https://aditya-sinha-dev.vercel.app/' },
    { name: 'Madhav Kumawat', role: 'Marketing Lead', code: 'MKT-01', initials: 'MK', dept: 'MKT', bio: 'Runs outreach, socials, and the story of who we are and why it works.', url: 'https://madhav-kumawat.vercel.app/' },
    { name: 'Harshit Kumawat', role: 'General Support', code: 'SUP-01', initials: 'HK', dept: 'SUPPORT', bio: 'The first reply when anyone — client or crew — needs a quick fix or a question answered.', url: 'https://harshit-kumawat-dev.vercel.app/' }
  ];
  for (const member of crew) {
    const existing = await get('SELECT id FROM crew_members WHERE code = ?', [member.code]);
    if (!existing) {
      const defaultPass = bcrypt.hashSync(member.code.toLowerCase() + '@2026', 10);
      await run(
        'INSERT INTO crew_members (name, role, code, initials, department, bio, portfolio_url, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [member.name, member.role, member.code, member.initials, member.dept, member.bio, member.url, defaultPass]
      );
    }
  }

  // Site settings
  const settings = [
    { key: 'company_name', value: 'The Launch Desk' },
    { key: 'company_tagline', value: 'Small crew. Real ops. No agency bloat.' },
    { key: 'company_email', value: 'hello@thelaunchdesk.io' },
    { key: 'projects_shipped', value: '40+' },
    { key: 'repeat_clients', value: '18' },
    { key: 'timezones', value: '03' },
    { key: 'crew_size', value: '07' }
  ];
  for (const s of settings) {
    const existing = await get('SELECT key FROM site_settings WHERE key = ?', [s.key]);
    if (!existing) {
      await run('INSERT INTO site_settings (key, value) VALUES (?, ?)', [s.key, s.value]);
    }
  }
}

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
