// ---------------------------------------------------------------------------
// src/client/routes/client.routes.js
// Client + auth + project + message API routes — grouped in the client module.
// ---------------------------------------------------------------------------
const express = require('express');
const AuthController = require('../controllers/auth.controller');
const ProjectController = require('../controllers/project.controller');
const MessageController = require('../controllers/messages.controller');
const { verifyToken, verifyTokenOrApiKey, requireAdmin } = require('../../middleware/auth');
const { clientOnly } = require('../middleware/guard');
const upload = require('../../middleware/upload');

const router = express.Router();

// --- Auth ---
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/me', verifyTokenOrApiKey, AuthController.me);
router.post('/auth/generate-key', verifyToken, clientOnly, AuthController.generateKey);
router.delete('/auth/revoke-key/:id', verifyToken, clientOnly, AuthController.revokeKey);
router.post('/auth/forgot-password', AuthController.forgotPassword);
router.post('/auth/reset-password', AuthController.resetPassword);

// --- Projects ---
// Read routes accept a JWT Bearer token OR an API key (x-api-key) so the API
// key can be used directly from Postman for a client's own project data.
router.get('/projects', verifyTokenOrApiKey, ProjectController.list);
router.get('/projects/:id', verifyTokenOrApiKey, ProjectController.detail);
router.post('/projects', verifyToken, clientOnly, ProjectController.create);
router.post('/projects/:id/upload', verifyToken, clientOnly, upload.array('files', 5), ProjectController.uploadFiles);

// Admin-managed project updates & deletion (used by the admin panel)
router.put('/projects/:id', verifyToken, requireAdmin, ProjectController.update);
router.delete('/projects/:id', verifyToken, requireAdmin, ProjectController.remove);

// --- Messages (mounted at /api/projects/:projectId/messages and /api/messages) ---
router.get('/projects/:projectId/messages', verifyToken, MessageController.list);
router.post('/projects/:projectId/messages', verifyToken, MessageController.create);
router.get('/messages/unread', verifyToken, MessageController.unread);

module.exports = router;
