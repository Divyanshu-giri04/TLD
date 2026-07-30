const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { getDatabase } = require('./database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
async function startServer() {
  try {
    await getDatabase();
    console.log('  ✅ Database initialized successfully');
    
    app.listen(PORT, () => {
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

startServer();

