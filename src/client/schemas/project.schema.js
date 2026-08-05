// ---------------------------------------------------------------------------
// src/client/schemas/project.schema.js
// Zod validation for client project applications.
// ---------------------------------------------------------------------------
const { z } = require('zod');

const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  department: z.string().max(30).optional().default(''),
  budget: z.string().max(50).optional().default(''),
  timeline: z.string().max(100).optional().default('')
});

module.exports = { createProjectSchema };
