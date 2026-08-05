// ---------------------------------------------------------------------------
// src/admin/schemas/project.schema.js
// Zod validation for project management (admin module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  department: z.string().max(30).nullable().optional(),
  status: z.enum(['applied', 'discovery', 'in_progress', 'review', 'completed', 'cancelled']).optional(),
  assigned_crew: z.union([z.string(), z.array(z.number())]).optional(),
  budget: z.string().max(50).nullable().optional(),
  timeline: z.string().max(100).nullable().optional(),
  start_date: z.string().max(30).optional(),
  end_date: z.string().max(30).optional()
});

module.exports = { updateProjectSchema };
