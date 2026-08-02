const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let src = fs.readFileSync(file, 'utf8');

// Find the listen callback closing, right after the Website console.log line.
// The source contains a literal backslash-n (the two characters \ and n) inside
// the template literal:  console.log(`  🌐 Website: http://localhost:${PORT}\n`);
const marker = 'Website: http://localhost:${PORT}';
const mIdx = src.indexOf(marker);
if (mIdx === -1) {
  console.error('WEBSITE LINE NOT FOUND');
  process.exit(1);
}

// Find the end of that console.log line
const lineStart = src.lastIndexOf('\n', mIdx) + 1;
const lineEnd = src.indexOf('\n', mIdx);
const line = src.slice(lineStart, lineEnd);
console.log('Found line:', JSON.stringify(line));

// The closing of the app.listen callback comes right after:
//   `  🌐 Website: http://localhost:${PORT}\n`);
//   });
const afterLine = src.slice(lineEnd + 1);
if (!afterLine.startsWith('    });')) {
  console.error('Expected "});" right after the website log line, got:', JSON.stringify(afterLine.slice(0, 40)));
  process.exit(1);
}

const insertion =
  '\n' +
  '      // Handle port conflicts gracefully instead of crashing with an unhandled \'error\' event\n' +
  "      server.on('error', (err) => {\n" +
  "        if (err.code === 'EADDRINUSE') {\n" +
  '          console.error(`\\n  \u{274C} Port ${PORT} is already in use.`);\n' +
  "          console.error('  \u{1F4A1} Another instance may be running. Stop it first, or set PORT to a free port.');\n" +
  '        } else {\n' +
  "          console.error('Server error:', err);\n" +
  '        }\n' +
  '        process.exit(1);\n' +
  '      });\n' +
  '    });';

src = src.slice(0, lineEnd + 1) + insertion + src.slice(lineEnd + 1);
fs.writeFileSync(file, src, 'utf8');
console.log('PATCHED server.js with EADDRINUSE handler');

