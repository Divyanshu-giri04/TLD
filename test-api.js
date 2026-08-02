/* Quick API smoke test — run with: node test-api.js */
const BASE = 'http://localhost:3000';

async function req(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  return { status: res.status, data };
}

function log(name, status, data) {
  console.log(`${status} ${name}`, data ? JSON.stringify(data).slice(0, 200) : '');
}

(async () => {
  // 1. Public endpoints
  let r = await req('GET', '/api/public/settings');
  log('GET /api/public/settings', r.status, r.data);

  r = await req('GET', '/api/departments');
  log('GET /api/departments', r.status, r.data);

  // 2. tld.db should be 404
  const res = await fetch(BASE + '/tld.db');
  log('GET /tld.db (should be 404)', res.status, null);

  // 3. Admin login
  r = await req('POST', '/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@thelaunchdesk.io',
    password: process.env.ADMIN_PASSWORD || 'Admin@2026'
  });
  log('POST /api/auth/login (admin)', r.status, r.data && { token: !!r.data.token, user: r.data.user && r.data.user.role });
  const adminToken = r.data && r.data.token;

  if (!adminToken) {
    console.log('\n❌ Admin login failed — using seeded admin@thelaunchdesk.io / Admin@2026?');
    return;
  }

  const adminH = { Authorization: 'Bearer ' + adminToken };

  // 4. Admin dashboard
  r = await req('GET', '/api/admin/dashboard', null, adminH);
  log('GET /api/admin/dashboard', r.status, r.data && r.data.stats);

  // 5. Registered client gets real API key attached (audit 2.2)
  const email = 'smoke_' + Date.now() + '@example.com';
  r = await req('POST', '/api/auth/register', {
    name: 'Smoke Test', email, password: 'smokepass123', company: 'SmokeCo'
  });
  log('POST /api/auth/register', r.status, r.data && { api_key: r.data.api_key ? 'present' : 'MISSING', user_id: r.data.user && r.data.user.id });
  const clientToken = r.data && r.data.token;
  const clientApiKey = r.data && r.data.api_key;
  const clientId = r.data && r.data.user && r.data.user.id;

  // Verify the API key actually resolves to the user via /api/auth/me (audit 2.2)
  if (clientApiKey) {
    const r2 = await fetch(BASE + '/api/auth/me', { headers: { 'x-api-key': clientApiKey } });
    const d2 = await r2.json();
    log('GET /api/auth/me with API key', r2.status, d2.user && { id: d2.user.id, email: d2.user.email });
  }

  // 6. Client creates a project
  if (clientToken) {
    r = await req('POST', '/api/projects', {
      title: 'Smoke Project', description: 'Test description', department: 'DEV'
    }, { Authorization: 'Bearer ' + clientToken });
    log('POST /api/projects', r.status, r.data && { id: r.data.project && r.data.project.id, status: r.data.project && r.data.project.status });
    const projectId = r.data && r.data.project && r.data.project.id;

    // 7. Messaging works under /api/projects/:id/messages (audit 2.1)
    if (projectId) {
      r = await req('POST', `/api/projects/${projectId}/messages`, { content: 'Hello from smoke test' }, { Authorization: 'Bearer ' + clientToken });
      log('POST /api/projects/:id/messages', r.status, r.data && r.data.message && { content: r.data.message.content, sender_role: r.data.message.sender_role });

      r = await req('GET', `/api/projects/${projectId}/messages`, null, { Authorization: 'Bearer ' + clientToken });
      log('GET /api/projects/:id/messages', r.status, r.data && { count: r.data.messages.length });

      // Admin replies
      r = await req('POST', `/api/projects/${projectId}/messages`, { content: 'Admin reply' }, adminH);
      log('POST admin reply', r.status, r.data && r.data.message && { sender_role: r.data.message.sender_role });

      // Single-query admin messages (audit 2.7 N+1 fixed)
      r = await req('GET', '/api/admin/messages', null, adminH);
      log('GET /api/admin/messages', r.status, r.data && { count: r.data.messages.length });
    }

    // 8. Crew list
    r = await req('GET', '/api/crew');
    log('GET /api/crew', r.status, r.data && { count: r.data.crew.length, sample: r.data.crew[0] && { name: r.data.crew[0].name, login_id: r.data.crew[0].login_id } });

    // 9. Crew forgot-password endpoint
    r = await req('POST', '/api/crew/forgot-password', { email: 'dev-01@crew.tld' });
    log('POST /api/crew/forgot-password', r.status, r.data);

    // 10. Client forgot-password
    r = await req('POST', '/api/auth/forgot-password', { email });
    log('POST /api/auth/forgot-password', r.status, r.data && { reset_token: r.data.reset_token ? 'present' : 'hidden' });
  }

  console.log('\n✨ Smoke test complete');
})();

