// ---------------------------------------------------------------------------
// src/client/schemas/auth.schema.js
// Zod validation for client auth (client module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().email('Valid email required').max(200),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
  company: z.string().max(150).optional().default(''),
  phone: z.string().max(40).optional().default(''),
  address: z.string().max(300).optional().default('')
});

const loginSchema = z.object({
  email: z.string().email('Valid email required').max(200),
  password: z.string().min(1, 'Password is required').max(200)
});

const generateKeySchema = z.object({
  label: z.string().trim().max(100).optional().default('New Key')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required')
});

const resetPasswordSchema = z.object({
  token: z.string().uuid('Invalid reset token'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200)
});

module.exports = {
  registerSchema,
  loginSchema,
  generateKeySchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
