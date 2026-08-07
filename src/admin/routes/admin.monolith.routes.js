// ---------------------------------------------------------------------------
// src/admin/routes/admin.monolith.routes.js
// Wires the monolithic AdminController (src/admin/controllers/admin.controller.js)
// into the running app. Mounted under /api/admin/legacy to avoid route conflicts
// with the existing split admin controllers.
// ---------------------------------------------------------------------------
const express = require('express');
const { verifyToken } = require('../../middleware/auth');
const { adminOnly } = require('../middleware/guard');
const AdminController = require('../controllers/admin.controller');

const router = express.Router();

// All monolith admin routes require a valid admin JWT
router.use(verifyToken, adminOnly);

// Dashboard + stats
router.get('/dashboard', AdminController.dashboard);
router.get('/stats', AdminController.stats);

// Settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', AdminController.updateSettings);

// Messages
router.get('/messages', AdminController.messages);

// Reset password
router.post('/reset-password', AdminController.resetPassword);

// Servers
router.get('/servers', AdminController.listServers);
router.post('/servers', AdminController.addServer);
router.put('/servers/:id', AdminController.updateServer);
router.delete('/servers/:id', AdminController.deleteServer);

// Teams
router.get('/teams', AdminController.listTeams);
router.post('/teams', AdminController.createTeam);
router.put('/teams/:id', AdminController.updateTeam);
router.delete('/teams/:id', AdminController.deleteTeam);

module.exports = router;
