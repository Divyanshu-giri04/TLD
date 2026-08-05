// ---------------------------------------------------------------------------
// src/admin/routes/admin.routes.js
// Admin API routes — fully self-contained admin module.
// ---------------------------------------------------------------------------
const express = require('express');
const { verifyToken, requireAdmin } = require('../../middleware/auth');

const DashboardController = require('../controllers/dashboard.controller');
const SettingsController = require('../controllers/settings.controller');
const AdminMessagesController = require('../controllers/messages.controller');
const PasswordController = require('../controllers/password.controller');
const ServersController = require('../controllers/servers.controller');
const TeamsController = require('../controllers/teams.controller');
const AdminClientsController = require('../controllers/clients.controller');

const router = express.Router();

// All admin routes require a valid admin JWT
router.use(verifyToken, requireAdmin);

// Dashboard + stats
router.get('/dashboard', DashboardController.dashboard);
router.get('/stats', DashboardController.stats);

// Settings
router.get('/settings', SettingsController.getSettings);
router.put('/settings', SettingsController.updateSettings);

// Messages
router.get('/messages', AdminMessagesController.messages);

// Reset password
router.post('/reset-password', PasswordController.resetPassword);

// Servers
router.get('/servers', ServersController.list);
router.post('/servers', ServersController.create);
router.put('/servers/:id', ServersController.update);
router.delete('/servers/:id', ServersController.remove);

// Teams
router.get('/teams', TeamsController.list);
router.post('/teams', TeamsController.create);
router.put('/teams/:id', TeamsController.update);
router.delete('/teams/:id', TeamsController.remove);

module.exports = router;
