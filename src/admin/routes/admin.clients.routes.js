// ---------------------------------------------------------------------------
// src/admin/routes/admin.clients.routes.js
// Admin-managed client CRUD routes (mounted at /api/clients).
// ---------------------------------------------------------------------------
const express = require('express');
const { verifyToken, requireAdmin } = require('../../middleware/auth');
const AdminClientsController = require('../controllers/clients.controller');

const router = express.Router();

// All client management routes require admin
router.use(verifyToken, requireAdmin);

// GET /api/clients - List all clients
router.get('/', AdminClientsController.list);

// POST /api/clients - Create client
router.post('/', AdminClientsController.create);

// PUT /api/clients/:id - Update client
router.put('/:id', AdminClientsController.update);

// DELETE /api/clients/:id - Delete client
router.delete('/:id', AdminClientsController.remove);

module.exports = router;
