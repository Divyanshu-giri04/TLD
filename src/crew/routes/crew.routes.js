// ---------------------------------------------------------------------------
// src/crew/routes/crew.routes.js
// Crew API routes — grouped here.
// ---------------------------------------------------------------------------
const express = require('express');
const CrewController = require('../controllers/crew.controller');
const { verifyToken, requireAdmin, optionalAuth } = require('../../middleware/auth');

const router = express.Router();

// Public list (safe subset; full detail only for admins via optionalAuth)
router.get('/', optionalAuth, CrewController.list);

// Crew login
router.post('/login', CrewController.login);

// Forgot password
router.post('/forgot-password', CrewController.forgotPassword);

// Get assigned projects for logged-in crew
router.get('/projects', verifyToken, CrewController.projects);

// Admin-only crew management
router.post('/', verifyToken, requireAdmin, CrewController.add);
router.put('/:id', verifyToken, requireAdmin, CrewController.update);
router.put('/:id/password', verifyToken, requireAdmin, CrewController.changePassword);
router.delete('/:id', verifyToken, requireAdmin, CrewController.remove);

module.exports = router;
