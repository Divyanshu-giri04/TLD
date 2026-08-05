// ---------------------------------------------------------------------------
// src/crew/schemas/crew.schema.js
// Zod validation for crew management (crew module).
// ---------------------------------------------------------------------------
const { z } = require('zod');

const addCrewSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  role: z.string().trim().min(1, 'Role is required').max(100),
  code: z.string().trim().min(1, 'Code is required').max(30),
  initials: z.string().trim().min(1, 'Initials are required').max(10),
  department: z.string().trim().min(1, 'Department is required').max(30),
  bio: z.string().max(2000).optional().default(''),
  portfolio_url: z.string().url().or(z.string().max(0)).optional().default(''),
  email: z.string().email().or(z.string().max(0)).optional().default(''),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

const updateCrewSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(30).optional(),
  bio: z.string().max(2000).optional(),
  portfolio_url: z.string().max(300).optional(),
  status: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  login_id: z.string().max(30).optional(),
  salary: z.string().max(50).optional(),
  contact_no: z.string().max(40).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
});

const crewLoginSchema = z.object({
  email: z.string().email().optional(),
  code: z.string().max(30).optional(),
  login_id: z.string().max(30).optional(),
  password: z.string().min(1, 'Password is required').max(200)
});

const crewForgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required').optional(),
  login_id: z.string().max(30).optional()
});

module.exports = {
  addCrewSchema,
  updateCrewSchema,
  crewLoginSchema,
  crewForgotPasswordSchema
};
