// ---------------------------------------------------------------------------
// src/config/mongoQuery.js
// Translates the specific SQL statements used by the controllers into Mongoose
// operations. This lets the existing controllers run unchanged against MongoDB.
//
// Handles the finite set of query shapes used in this codebase:
//   - SELECT ... FROM <t> [WHERE ...] [ORDER BY ...] [LIMIT .. OFFSET ..]
//   - SELECT ... FROM a JOIN b ON ... WHERE ...
//   - INSERT INTO <t> (cols) VALUES (?, ...)
//   - UPDATE <t> SET col = ?, ... WHERE ...
//   - DELETE FROM <t> WHERE ...
//   - COUNT(*) as count
//
// NOTE: `mongoModels` is loaded lazily (inside functions) to avoid a circular
// require with ./db.js.
// ---------------------------------------------------------------------------
const { nextId } = require('./repo');

function getModels() {
  // Lazy require avoids the db <-> mongoQuery circular dependency.
  return require('./db').mongoModels();
}

const MODELS = {
  users: 'User',
  api_keys: 'ApiKey',
  crew_members: 'CrewMember',
  departments: 'Department',
  projects: 'Project',
  messages: 'Message',
  project_assignments: 'ProjectAssignment',
  teams: 'Team',
  team_members: 'TeamMember',
  servers: 'Server',
  site_settings: 'SiteSetting',
  password_reset_tokens: 'PasswordResetToken'
};

function getModel(name) {
  const m = getModels()[MODELS[name] || name];
  if (!m) throw new Error('No model for table: ' + name);
  return m;
}

// ---- tiny SQL tokenizer / parser for the patterns used here ----

function stripAlias(expr) {
  const parts = expr.split('.');
  return parts[parts.length - 1].trim();
}

function parseWhere(whereSql, params, startIdx) {
  const filter = {};
  const tokens = whereSql
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  let i = 0;
  let pi = startIdx;

  const apply = (col, op, val) => {
    const key = stripAlias(col.replace(/^'|'$/g, ''));
    if (op === '=') filter[key] = val;
    else if (op === '!=') filter[key] = { $ne: val };
    else if (op === '>') filter[key] = { $gt: val };
    else if (op === '<') filter[key] = { $lt: val };
    else if (op === '>=') filter[key] = { $gte: val };
    else if (op === '<=') filter[key] = { $lte: val };
    else if (op.toLowerCase() === 'is' && String(val).toLowerCase() === 'null') filter[key] = null;
    else throw new Error('Unsupported WHERE op: ' + op);
  };

  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk === 'AND' || tk === 'OR') { i++; continue; }
    // detect IN ( ... )
    const inMatch = tokens.slice(i, i + 3).join(' ').match(/^(\S+)\s+IN\s*\($/i);
    if (inMatch) {
      const col = stripAlias(inMatch[1]);
      const vals = [];
      i += 3;
      while (tokens[i] !== ')' && i < tokens.length) {
        if (tokens[i] === '?') vals.push(params[pi++]);
        i++;
      }
      i++;
      filter[col] = { $in: vals };
      continue;
    }
    const col = tk;
    const op = tokens[i + 1];
    const valTk = tokens[i + 2];
    if (valTk === '?') {
      apply(col, op, params[pi]);
      pi++;
      i += 3;
    } else if (valTk && valTk.toUpperCase() === 'NULL') {
      filter[stripAlias(col)] = null;
      i += 3;
    } else {
      let val = valTk;
      if (valTk && /CURRENT_TIMESTAMP|datetime\s*\(|now\s*\(/i.test(valTk)) {
        apply(col, op, new Date());
        i += 3;
        continue;
      }
      if (valTk && /^['"]/.test(valTk)) val = valTk.replace(/^['"]|['"]$/g, '');
      apply(col, op, val);
      i += 3;
    }
  }
  return { filter, nextParamIdx: pi };
}

function parseOrderBy(orderSql) {
  const parts = orderSql.split(',');
  const sort = {};
  for (const part of parts) {
    const m = part.trim().split(/\s+/);
    const col = stripAlias(m[0].replace(/\./g, '.'));
    sort[col] = (m[1] && m[1].toUpperCase() === 'DESC') ? -1 : 1;
  }
  return sort;
}

function parseSelect(sql) {
  const fromIdx = sql.toUpperCase().indexOf(' FROM ');
  const whereIdx = sql.toUpperCase().indexOf(' WHERE ');
  const orderIdx = sql.toUpperCase().indexOf(' ORDER BY ');
  const limitIdx = sql.toUpperCase().indexOf(' LIMIT ');
  const groupIdx = sql.toUpperCase().indexOf(' GROUP BY ');

  const rest = sql.slice(fromIdx + 6);
  let endIdx = rest.length;
  if (whereIdx > -1) endIdx = Math.min(endIdx, whereIdx - fromIdx - 6);
  if (orderIdx > -1) endIdx = Math.min(endIdx, orderIdx - fromIdx - 6);
  if (limitIdx > -1) endIdx = Math.min(endIdx, limitIdx - fromIdx - 6);
  if (groupIdx > -1) endIdx = Math.min(endIdx, groupIdx - fromIdx - 6);
  const fromClause = rest.slice(0, endIdx).trim();
  const mainTable = fromClause.split(/\s+/)[0];
  const hasJoin = /JOIN/i.test(fromClause);

  let whereSql = null;
  if (whereIdx > -1) {
    let wEnd = rest.length;
    if (orderIdx > -1) wEnd = Math.min(wEnd, orderIdx - fromIdx - 6);
    if (limitIdx > -1) wEnd = Math.min(wEnd, limitIdx - fromIdx - 6);
    if (groupIdx > -1) wEnd = Math.min(wEnd, groupIdx - fromIdx - 6);
    whereSql = rest.slice(whereIdx - fromIdx - 6 + 7, wEnd).trim();
  }

  let orderSql = null;
  if (orderIdx > -1) {
    let oEnd = rest.length;
    if (limitIdx > -1) oEnd = Math.min(oEnd, limitIdx - fromIdx - 6);
    orderSql = rest.slice(orderIdx - fromIdx - 6 + 8, oEnd).trim();
  }

  let limit = null;
  let offset = null;
  if (limitIdx > -1) {
    const limRest = rest.slice(limitIdx - fromIdx - 6 + 7).trim().split(/\s+/);
    limit = parseInt(limRest[0]);
    const offIdx = limRest.indexOf('OFFSET');
    if (offIdx > -1) offset = parseInt(limRest[offIdx + 1]);
  }

  return { mainTable, hasJoin, fromClause, whereSql, orderSql, limit, offset };
}

async function runJoin(desc, params) {
  const M = getModels();
  const sql = (desc.fromClause + ' ' + (desc.whereSql || '')).replace(/\s+/g, ' ').trim();

  // api_keys JOIN users (verify API key)
  if (/api_keys\s+JOIN\s+users/i.test(sql)) {
    const key = params[0];
    const keyDoc = await M.ApiKey.findOne({ key }).lean();
    if (!keyDoc) return [];
    const user = await M.User.findOne({ id: keyDoc.user_id }).lean();
    if (!user) return [];
    return [{ key_id: keyDoc.id, key: keyDoc.key, user_id: user.id, name: user.name, email: user.email, role: user.role }];
  }

  // projects JOIN users
  if (/projects\s+(?:p\s+)?JOIN\s+users\s+(?:u\s+)?ON/i.test(sql)) {
    let filter = {};
    if (desc.whereSql) filter = parseWhere(desc.whereSql, params, 0).filter;
    const sort = desc.orderSql ? parseOrderBy(desc.orderSql) : { created_at: -1 };
    const docs = await M.Project.find(filter).sort(sort).limit(desc.limit || 0).skip(desc.offset || 0).lean();
    const users = await M.User.find({}).lean();
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });
    return docs.map(p => {
      const u = userMap[p.client_id] || {};
      return { ...p, client_name: u.name, client_email: u.email, client_company: u.company };
    });
  }

  // servers LEFT JOIN users
  if (/servers\s+(?:s\s+)?(LEFT\s+)?JOIN\s+users/i.test(sql)) {
    const docs = await M.Server.find({}).sort({ created_at: -1 }).lean();
    const users = await M.User.find({}).lean();
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });
    return docs.map(s => ({ ...s, client_name: s.client_id ? (userMap[s.client_id] ? userMap[s.client_id].name : null) : null }));
  }

  // teams LEFT JOIN projects LEFT JOIN users
  if (/teams\s+(?:t\s+)?(LEFT\s+)?JOIN\s+projects/i.test(sql)) {
    const docs = await M.Team.find({}).sort({ created_at: -1 }).lean();
    const projects = await M.Project.find({}).lean();
    const users = await M.User.find({}).lean();
    const pMap = {}; projects.forEach(p => { pMap[p.id] = p; });
    const uMap = {}; users.forEach(u => { uMap[u.id] = u; });
    const teamIds = docs.map(t => t.id);
    const counts = await M.TeamMember.aggregate([
      { $match: { team_id: { $in: teamIds } } },
      { $group: { _id: '$team_id', n: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.n; });
    return docs.map(t => {
      const p = pMap[t.project_id] || {};
      const u = uMap[t.client_id] || {};
      return { ...t, project_title: p.title, client_name: u.name, member_count: countMap[t.id] || 0 };
    });
  }

  // team_members JOIN crew_members
  if (/team_members\s+(?:tm\s+)?JOIN\s+crew_members/i.test(sql)) {
    const teamId = params[params.length - 1];
    const tms = await M.TeamMember.find({ team_id: teamId }).lean();
    const crewIds = [...new Set(tms.map(t => t.crew_id))];
    const crew = await M.CrewMember.find({ id: { $in: crewIds } }).lean();
    return crew;
  }

  // projects JOIN users JOIN project_assignments (crew projects)
  if (/projects\s+(?:p\s+)?JOIN\s+users\s+(?:u\s+)?JOIN\s+project_assignments/i.test(sql)) {
    const crewId = params[0];
    const assigns = await M.ProjectAssignment.find({ crew_id: crewId }).lean();
    const projIds = assigns.map(a => a.project_id);
    const docs = await M.Project.find({ id: { $in: projIds } }).sort(desc.orderSql ? parseOrderBy(desc.orderSql) : { created_at: -1 }).lean();
    const users = await M.User.find({}).lean();
    const uMap = {}; users.forEach(u => { uMap[u.id] = u; });
    return docs.map(p => ({ ...p, client_name: (uMap[p.client_id]||{}).name, client_email: (uMap[p.client_id]||{}).email }));
  }

  // messages JOIN projects JOIN users (admin messages list)
  if (/messages\s+(?:m\s+)?JOIN\s+projects/i.test(sql)) {
    let filter = {};
    if (desc.whereSql) filter = parseWhere(desc.whereSql, params, 0).filter;
    const docs = await M.Message.find(filter).sort({ created_at: -1 }).limit(desc.limit || 0).lean();
    const projects = await M.Project.find({}).lean();
    const users = await M.User.find({}).lean();
    const crew = await M.CrewMember.find({}).lean();
    const pMap = {}; projects.forEach(p => { pMap[p.id] = p; });
    const uMap = {}; users.forEach(u => { uMap[u.id] = u; });
    const cMap = {}; crew.forEach(c => { cMap[c.id] = c; });
    return docs.map(m => {
      const p = pMap[m.project_id] || {};
      const u = uMap[p.client_id] || {};
      let sender_name = u.name;
      if (m.sender_role === 'crew') sender_name = (cMap[m.sender_id] || {}).name;
      return { ...m, project_title: p.title, client_id: p.client_id, client_name: u.name, client_email: u.email, sender_name };
    });
  }

  // messages JOIN projects (per-project messages list)
  if (/messages\s+(m\s+)?JOIN\s+projects\s+p\s+ON\s+m\.project_id\s*=\s*p\.id/i.test(sql)) {
    const filter = desc.whereSql ? parseWhere(desc.whereSql, params, 0).filter : {};
    const docs = await M.Message.find(filter).sort({ created_at: 1 }).lean();
    const users = await M.User.find({}).lean();
    const crew = await M.CrewMember.find({}).lean();
    const uMap = {}; users.forEach(u => { uMap[u.id] = u; });
    const cMap = {}; crew.forEach(c => { cMap[c.id] = c; });
    return docs.map(m => {
      let sender_name = (uMap[m.sender_id]||{}).name;
      if (m.sender_role === 'crew') sender_name = (cMap[m.sender_id]||{}).name;
      return { ...m, sender_name, sender_user_role: m.sender_role };
    });
  }

  throw new Error('Unsupported JOIN query: ' + sql);
}

async function runSelect(sql, params) {
  const M = getModels();
  const desc = parseSelect(sql);

  // COUNT queries
  if (/COUNT\s*\(\s*\*?\s*\)\s*as\s+count/i.test(sql)) {
    let filter = {};
    if (desc.whereSql) filter = parseWhere(desc.whereSql, params, 0).filter;
    const Model = getModel(desc.mainTable);
    const count = await Model.countDocuments(filter);
    return [{ count }];
  }
  if (/COUNT\s*\(\s*\*?\s*\)\s*as\s+c/i.test(sql)) {
    let filter = {};
    if (desc.whereSql) filter = parseWhere(desc.whereSql, params, 0).filter;
    const Model = getModel(desc.mainTable);
    const count = await Model.countDocuments(filter);
    return [{ c: count }];
  }

  if (desc.hasJoin) {
    return runJoin(desc, params);
  }

  const Model = getModel(desc.mainTable);
  let filter = {};
  if (desc.whereSql) filter = parseWhere(desc.whereSql, params, 0).filter;

  const sort = desc.orderSql ? parseOrderBy(desc.orderSql) : {};

  let query = Model.find(filter);
  if (desc.limit) query = query.limit(desc.limit);
  if (desc.offset) query = query.skip(desc.offset);
  if (Object.keys(sort).length) query = query.sort(sort);
  const docs = await query.lean();

  return docs;
}

async function runInsert(sql, params) {
  const M = getModels();
  const m = sql.match(/INSERT\s+INTO\s+([a-z_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!m) throw new Error('Unsupported INSERT: ' + sql);
  const table = m[1];
  const cols = m[2].split(',').map(c => c.trim());
  const placeholders = m[3].split(',').map(c => c.trim());
  const Model = getModel(table);
  const doc = {};
  let pi = 0;
  cols.forEach((c, idx) => {
    if (placeholders[idx] === '?') doc[c] = params[pi++];
    else doc[c] = placeholders[idx].replace(/^['"]|['"]$/g, '');
  });
  const id = await nextId(Model, table);
  doc.id = id;
  if (table === 'users' && doc.role === undefined) doc.role = 'client';
  if (table === 'projects') { doc.status = doc.status || 'applied'; doc.files = doc.files || '[]'; }
  const created = await Model.create(doc);
  return { changes: 1, lastId: id };
}

async function runUpdate(sql, params) {
  const M = getModels();
  const m = sql.match(/UPDATE\s+([a-z_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
  if (!m) throw new Error('Unsupported UPDATE: ' + sql);
  const table = m[1];
  const setClause = m[2];
  const whereClause = m[3];
  const Model = getModel(table);

  const setAssigns = setClause.split(',').map(s => s.trim());
  const updateObj = {};
  let pi = 0;
  for (const assign of setAssigns) {
    const parts = assign.split(/\s*=\s*/);
    const col = stripAlias(parts[0]);
    const valTk = parts.slice(1).join('=');
    if (valTk.trim() === '?') {
      updateObj[col] = params[pi++];
    } else {
      const literal = valTk.trim();
      if (/CURRENT_TIMESTAMP|datetime\s*\(|now\s*\(/i.test(literal)) {
        updateObj[col] = new Date();
      } else {
        updateObj[col] = literal.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  const { filter, nextParamIdx } = parseWhere(whereClause, params, pi);
  pi = nextParamIdx;

  const result = await Model.updateMany(filter, { $set: updateObj });
  return { changes: result.modifiedCount, lastId: null };
}

async function runDelete(sql, params) {
  const m = sql.match(/DELETE\s+FROM\s+([a-z_]+)\s+WHERE\s+(.+)/i);
  if (!m) throw new Error('Unsupported DELETE: ' + sql);
  const table = m[1];
  const Model = getModel(table);
  const { filter } = parseWhere(m[2], params, 0);
  const result = await Model.deleteMany(filter);
  return { changes: result.deletedCount, lastId: null };
}

async function runTransaction(fn) {
  // Simple in-memory transaction: run fn; no multi-doc atomicity via this shim.
  return fn();
}

// Public dispatch
async function mongoQuery(sql, params = []) {
  const trimmed = sql.trim();
  if (/^SELECT/i.test(trimmed)) return runSelect(trimmed, params);
  if (/^INSERT/i.test(trimmed)) return runInsert(trimmed, params);
  if (/^UPDATE/i.test(trimmed)) return runUpdate(trimmed, params);
  if (/^DELETE/i.test(trimmed)) return runDelete(trimmed, params);
  throw new Error('Unsupported SQL: ' + trimmed);
}

module.exports = { mongoQuery, runTransaction, getModel };
