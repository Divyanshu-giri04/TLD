// ---------------------------------------------------------------------------
// src/client/routes/client.routes.js
// Client + auth + project + message API routes — grouped in the client module.
// ---------------------------------------------------------------------------
const express = require('express');
const AuthController = require('../controllers/auth.controller');
const ProjectController = require('../controllers/project.controller');
const MessageController = require('../controllers/messages.controller');
const { verifyToken, verifyTokenOrApiKey } = require('../../middleware/auth');
const upload = require('../../middleware/upload');

const router = express.Router();

// --- Auth ---
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/me', verifyTokenOrApiKey, AuthController.me);
router.post('/auth/generate-key', verifyToken, AuthController.generateKey);
router.delete('/auth/revoke-key/:id', verifyToken, AuthController.revokeKey);
router.post('/auth/forgot-password', AuthController.forgotPassword);
router.post('/auth/reset-password', AuthController.resetPassword);

// --- Projects ---
// Read routes accept a JWT Bearer token OR an API key (x-api-key) so the API
// key can be used directly from Postman for a client's own project data.
router.get('/projects', verifyTokenOrApiKey, ProjectController.list);
router.get('/projects/:id', verifyTokenOrApiKey, ProjectController.detail);
router.post('/projects', verifyToken, ProjectController.create);
router.post('/projects/:id/upload', verifyToken, upload.array('files', 5), ProjectController.uploadFiles);

// --- Messages (mounted at /api/projects/:projectId/messages and /api/messages) ---
router.get('/projects/:projectId/messages', verifyToken, MessageController.list);
router.post('/projects/:projectId/messages', verifyToken, MessageController.create);
router.get('/messages/unread', verifyToken, MessageController.unread);

module.exports = router;
