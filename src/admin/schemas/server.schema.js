// ---------------------------------------------------------------------------
// src/admin/schemas/server.schema.js
// Zod validation for server management (admin module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const serverSchema = z.object({
  server_name: z.string().trim().min(1, 'Server name is required').max(150),
  ip: z.string().max(80).optional().default(''),
  port: z.string().max(20).optional().default(''),
  client_id: z.number().int().positive().optional()
});

module.exports = { serverSchema };
