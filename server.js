const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { getDatabase } = require('./database');

dotenv.config();

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const uploadsDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

// ---------------------------------------------------------------------------
// Security middleware (audit 1.4)
// ---------------------------------------------------------------------------

app.use(helmet());

// CORS allowlist — only trusted origins (audit 1.4)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, cb) {
    // Allow same-origin requests (no Origin header) and whitelisted origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

// ---------------------------------------------------------------------------
// Static + routes
// ---------------------------------------------------------------------------

// ONLY public/ is served statically (audit 1.1 — never the project root)
app.use(express.static(path.join(__dirname, 'public')));

// No public /uploads — files are served via authenticated /api/files (audit 2.7)

// API Routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const messageRoutes = require('./routes/messages');
const crewRoutes = require('./routes/crew');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', apiLimiter, clientRoutes);
app.use('/api/projects', apiLimiter, projectRoutes);
// Messages router mounted at BOTH /api/projects (GET/POST :id/messages)
// and /api/messages (GET /unread) — audit 2.1
app.use('/api/projects', apiLimiter, messageRoutes);
app.use('/api/messages', apiLimiter, messageRoutes);
app.use('/api/crew', apiLimiter, crewRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/public', publicRoutes);
// Also expose /api/departments (public) — audit 2.5
app.use('/api', publicRoutes);
app.use('/api', apiLimiter, require('./routes/files'));

// Health checks for deployment platforms
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'the-launch-desk' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'the-launch-desk' });
});

// Serve main HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/portal', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client-portal.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-panel.html'));
});

app.get('/crew', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'crew-portal.html'));
});

// Error handling middleware — do NOT leak err.message (audit 2.7)
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (err.message && err.message.includes('File type not supported')) {
    return res.status(400).json({ error: 'File type not supported' });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
let server;

async function startServer() {
  try {
    await getDatabase();
    console.log('  ✅ Database initialized successfully');

    server = app.listen(PORT, HOST, () => {
      console.log(`\n  🚀 The Launch Desk server running`);
      console.log(`  📡 http://localhost:${PORT}`);
      console.log(`  📊 Admin Panel: http://localhost:${PORT}/admin`);
      console.log(`  🔑 Client Portal: http://localhost:${PORT}/portal`);
      console.log(`  👥 Crew Portal: http://localhost:${PORT}/crew`);
      console.log(`  🌐 Website: http://localhost:${PORT}\n`);

      // Handle port conflicts gracefully instead of crashing with an unhandled 'error' event
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`\n  ❌ Port ${PORT} is already in use.`);
          console.error('  💡 Another instance may be running. Stop it first, or set PORT to a free port.');
        } else {
          console.error('Server error:', err);
        }
        process.exit(1);
      });
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer();

