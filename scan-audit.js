// Scan key source files for leftover audit issues
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const files = [
  'server.js',
  'database.js',
  'middleware/auth.js',
  'middleware/upload.js',
  'routes/auth.js',
  'routes/clients.js',
  'routes/projects.js',
  'routes/crew.js',
  'routes/messages.js',
  'routes/admin.js',
  'routes/public.js',
  'routes/files.js',
  'public/index.html',
  'public/client-portal.html',
  'public/admin-panel.html',
  'public/crew-portal.html'
];

const patterns = [
  { re: /temp-pass-/, label: 'temp-password generation (audit 2.3)' },
  { re: /api\/public\/departments/, label: 'wrong departments URL (audit 2.5)' },
  { re: /result\.changes\s*\)/, label: 'changes used as user id (audit 2.2)' },
  { re: /ORDER BY id DESC LIMIT 1/, label: 'race-condition last-row fetch (audit 2.4)' },
  { re: /JWT_SECRET \|\| /, label: 'insecure JWT fallback (audit 1.2)' },
  { re: /express\.static\(__dirname\)/, label: 'project-root static serving (audit 1.1)' },
  { re: /prompt\(/, label: 'prompt() usage (audit 2.7)' },
  { re: /password === crewMember\.password/, label: 'plaintext crew password (audit 2.7)' },
  { re: /extname \|\| mimetype|extname\s*\|\|\s*mimetype/, label: 'weak upload filter (audit 2.7)' }
];

let found = false;
for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    for (const p of patterns) {
      if (p.re.test(line)) {
        found = true;
        console.log(`${file}:${i + 1}  [${p.label}]  ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (!found) {
  console.log('No leftover audit-pattern matches found.');
}

