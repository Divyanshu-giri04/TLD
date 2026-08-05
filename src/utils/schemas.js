// ---------------------------------------------------------------------------
// src/utils/schemas.js
// Shared zod validation schemas (audit 1.4: request-body validation).
// ---------------------------------------------------------------------------
const { z } = require('zod');

// --- Auth (client) ---
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

// --- Clients (admin managed) ---
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

// --- Projects ---
const createProjectSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(5000),
  department: z.string().max(30).optional().default(''),
  budget: z.string().max(50).optional().default(''),
  timeline: z.string().max(100).optional().default('')
});

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

// --- Messages ---
const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content is required').max(5000)
});

// --- Crew ---
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

// --- Admin ---
const adminResetPasswordSchema = z.object({
  type: z.enum(['client', 'crew', 'admin'], { error: 'target type is client, crew, or admin' }),
  email: z.string().email('Valid email required'),
  new_password: z.string().min(6, 'Password must be at least 6 characters').max(200)
});

const serverSchema = z.object({
  server_name: z.string().trim().min(1, 'Server name is required').max(150),
  ip: z.string().max(80).optional().default(''),
  port: z.string().max(20).optional().default(''),
  client_id: z.number().int().positive().optional()
});

const teamSchema = z.object({
  project_id: z.number().int().positive('Project id is required'),
  team_name: z.string().trim().min(1, 'Team name is required').max(150),
  client_id: z.number().int().positive().optional(),
  crew_ids: z.array(z.number().int().positive()).optional().default([])
});

module.exports = {
  registerSchema,
  loginSchema,
  generateKeySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createClientSchema,
  updateClientSchema,
  createProjectSchema,
  updateProjectSchema,
  sendMessageSchema,
  addCrewSchema,
  updateCrewSchema,
  crewLoginSchema,
  crewForgotPasswordSchema,
  adminResetPasswordSchema,
  serverSchema,
  teamSchema
};
