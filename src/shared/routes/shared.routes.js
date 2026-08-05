// ---------------------------------------------------------------------------
// src/shared/routes/shared.routes.js
// Shared/public routes: file serving, public settings, departments.
// ---------------------------------------------------------------------------
const express = require('express');
const FilesController = require('../controllers/files.controller');
const PublicController = require('../controllers/public.controller');
const { verifyTokenOrApiKey } = require('../../middleware/auth');

const router = express.Router();

// Public settings + departments (public)
router.get('/public/settings', PublicController.settings);
router.get('/departments', PublicController.departments);

// Authenticated file serving
router.get('/files/:filename', verifyTokenOrApiKey, FilesController.serve);

module.exports = router;
