const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'tld.db');

let db = null;
let SQL = null;

async function getDatabase() {
  if (db) return db;

  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  initTables();
  seedDefaults();
  saveDatabase();

  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Wrapper to make sql.js API feel more like better-sqlite3
function prepare(sql) {
  const stmt = db.prepare(sql);
  return {
    run(...params) {
      stmt.run(params);
      stmt.free();
      saveDatabase();
      return { changes: db.getRowsModified() };
    },
    get(...params) {
      stmt.bind(params);
      if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all(...params) {
      const results = [];
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
  };
}

function exec(sql) {
  db.run(sql);
  saveDatabase();
}

function transaction(fn) {
  return function(...args) {
    db.run('BEGIN TRANSACTION');
    try {
      fn(...args);
      db.run('COMMIT');
      saveDatabase();
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  };
}

function initTables() {
  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin','client')) DEFAULT 'client',
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT 'Default',
      last_used TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS crew_members (
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
      created_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      head_count INTEGER DEFAULT 1
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS projects (
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
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      sender_role TEXT CHECK(sender_role IN ('client','admin','crew')) DEFAULT 'client',
      content TEXT NOT NULL,
      attachment TEXT DEFAULT '',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT DEFAULT ''
    )
  `);
}

function seedDefaults() {
  // Seed admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thelaunchdesk.io';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2026';

  const existingAdmin = prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const hashedPass = bcrypt.hashSync(adminPass, 10);
    prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)').run(
      'Admin', adminEmail, hashedPass, 'admin'
    );
  }

  // Seed departments
  const departments = [
    { code: 'LEAD', title: 'Direction', desc: 'Sets scope, owns the final call on anything client-facing, and steps in wherever a desk needs backup.', count: 1 },
    { code: 'DEV', title: 'Development', desc: 'Websites, web apps, and internal tools, built and shipped by two developers who pair on anything non-trivial.', count: 2 },
    { code: 'OPS', title: 'Client & People Management', desc: 'Keeping clients briefed, contracts clear, and the crew workload sane.', count: 2 },
    { code: 'MKT', title: 'Marketing & Growth', desc: 'Positioning, outreach, and the portfolio you are reading right now.', count: 1 },
    { code: 'SUPPORT', title: 'General Support', desc: 'The desk anyone can reach for help mid-project — questions, small fixes.', count: 1 },
    { code: 'HR', title: 'HR', desc: 'Collaboration and pair-programming mindset are essential.', count: 1 }
  ];

  for (const dept of departments) {
    const existing = prepare('SELECT id FROM departments WHERE code = ?').get(dept.code);
    if (!existing) {
      prepare('INSERT INTO departments (code, title, description, head_count) VALUES (?, ?, ?, ?)').run(
        dept.code, dept.title, dept.desc, dept.count
      );
    }
  }

  // Seed crew members
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
    const existing = prepare('SELECT id FROM crew_members WHERE code = ?').get(member.code);
    if (!existing) {
      const defaultPass = bcrypt.hashSync(member.code.toLowerCase() + '@2026', 10);
      prepare('INSERT INTO crew_members (name, role, code, initials, department, bio, portfolio_url, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        member.name, member.role, member.code, member.initials, member.dept, member.bio, member.url, defaultPass
      );
    }
  }

  // Seed site settings
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
    const existing = prepare('SELECT id FROM site_settings WHERE key = ?').get(s.key);
    if (!existing) {
      prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(s.key, s.value);
    }
  }
}

module.exports = { getDatabase, prepare, exec, transaction };

