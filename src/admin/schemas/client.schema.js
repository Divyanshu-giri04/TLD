// ---------------------------------------------------------------------------
// src/admin/schemas/client.schema.js
// Zod validation for client management (admin module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().email('Valid email required').max(200),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  company: z.string().max(150).optional().default(''),
  phone: z.string().max(40).optional().default('')
});

const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  company: z.string().max(150).optional(),
  phone: z.string().max(40).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

module.exports = { createClientSchema, updateClientSchema };
