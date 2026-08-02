// Verify static-file exposure fixes (AUDIT 1.1) + index.html API URLs
const http = require('http');

function check(path) {
  return new Promise((resolve) => {
    http.get({ host: 'localhost', port: 3000, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', (e) => resolve({ status: 'ERR', body: String(e) }));
  });
}

(async () => {
  const tests = [
    // Project-root files must NOT be served (audit 1.1)
    ['/tld.db', 404],
    ['/routes/auth.js', 404],
    ['/package-lock.json', 404],
    ['/middleware/auth.js', 404],
    ['/.env', 404],
    // Moved INTO public/ so they ARE served, but from public only
    ['/css2.css', 200],
    ['/launch-desk-portfolio.html', 200],
    // Public pages
    ['/', 200],
    ['/portal', 200],
    ['/admin', 200],
    ['/crew', 200],
    ['/css/style.css', 200]
  ];

  let pass = true;
  for (const [path, expected] of tests) {
    const r = await check(path);
    const ok = r.status === expected;
    if (!ok) pass = false;
    console.log(`${ok ? 'PASS' : 'FAIL'}  GET ${path} -> ${r.status} (expected ${expected})`);
  }
  console.log(pass ? '\nAll static checks passed.' : '\nSOME CHECKS FAILED.');
  process.exit(pass ? 0 : 1);
})();

