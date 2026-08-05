// ---------------------------------------------------------------------------
// src/admin/schemas/team.schema.js
// Zod validation for team management (admin module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const teamSchema = z.object({
  project_id: z.number().int().positive('Project id is required'),
  team_name: z.string().trim().min(1, 'Team name is required').max(150),
  client_id: z.number().int().positive().optional(),
  crew_ids: z.array(z.number().int().positive()).optional().default([])
});

module.exports = { teamSchema };
