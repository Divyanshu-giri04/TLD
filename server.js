const express = require('express');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Expose project-root assets for hosted pages and shared styles
app.use(express.static(__dirname));

// Serve uploads directory
app.use('/uploads', express.static(uploadsDir));

// API Routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const messageRoutes = require('./routes/messages');
const crewRoutes = require('./routes/crew');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', messageRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/crew', crewRoutes);
app.use('/api/admin', adminRoutes);

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
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
      console.log(`  🌐 Website: http://localhost:${PORT}\n`);
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

