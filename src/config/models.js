// ---------------------------------------------------------------------------
// src/config/models.js
// Mongoose models for The Launch Desk. Each model maps to the equivalent SQL
// table used by the SQLite branch (same field names, plus a numeric `id` field
// that is auto-incremented via an `id_counters` collection so the REST API and
// front-end continue to receive the same numeric IDs).
// ---------------------------------------------------------------------------
const mongoose = require('mongoose');

const { Schema } = mongoose;

// Auto-increment counter document used to assign numeric `id` fields.
const idCounterSchema = new Schema({
  _id: { type: String, required: true }, // table/collection name
  seq: { type: Number, default: 0 }
});

// ---------------------------------------------------------------------------
// users (clients + admin)
// ---------------------------------------------------------------------------
const userSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'client'], default: 'client' },
  company: { type: String, default: '' },
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  avatar: { type: String, default: '' },
  status: { type: String, default: 'active' },
  created_at: { type: Date, default: Date.now }
}, { collection: 'users', versionKey: false });

// ---------------------------------------------------------------------------
// api_keys
// ---------------------------------------------------------------------------
const apiKeySchema = new Schema({
  id: { type: Number, unique: true, required: true },
  user_id: { type: Number, required: true, index: true },
  key: { type: String, unique: true, required: true },
  label: { type: String, default: 'Default' },
  last_used: { type: Date, default: null },
  created_at: { type: Date, default: Date.now }
}, { collection: 'api_keys', versionKey: false });

// ---------------------------------------------------------------------------
// crew_members
// ---------------------------------------------------------------------------
const crewSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  code: { type: String, unique: true, required: true },
  initials: { type: String, required: true },
  department: { type: String, required: true },
  bio: { type: String, default: '' },
  portfolio_url: { type: String, default: '' },
  status: { type: String, default: 'ON DECK' },
  email: { type: String, default: '' },
  password: { type: String, default: '' },
  login_id: { type: String, default: '' },
  salary: { type: String, default: '' },
  contact_no: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
}, { collection: 'crew_members', versionKey: false });

// ---------------------------------------------------------------------------
// departments
// ---------------------------------------------------------------------------
const departmentSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  code: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  head_count: { type: Number, default: 1 }
}, { collection: 'departments', versionKey: false });

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
const projectSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  client_id: { type: Number, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  department: { type: String, default: '' },
  status: {
    type: String,
    enum: ['applied', 'discovery', 'in_progress', 'review', 'completed', 'cancelled'],
    default: 'applied'
  },
  assigned_crew: { type: String, default: '' },
  budget: { type: String, default: '' },
  timeline: { type: String, default: '' },
  files: { type: String, default: '[]' },
  start_date: { type: String, default: '' },
  end_date: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { collection: 'projects', versionKey: false });

// ---------------------------------------------------------------------------
// messages
// ---------------------------------------------------------------------------
const messageSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  project_id: { type: Number, required: true, index: true },
  sender_id: { type: Number, required: true },
  sender_role: { type: String, enum: ['client', 'admin', 'crew'], default: 'client' },
  content: { type: String, required: true },
  attachment: { type: String, default: '' },
  is_read: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { collection: 'messages', versionKey: false });

// ---------------------------------------------------------------------------
// project_assignments
// ---------------------------------------------------------------------------
const projectAssignmentSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  project_id: { type: Number, required: true, index: true },
  crew_id: { type: Number, required: true, index: true },
  role: { type: String, default: '' }
}, { collection: 'project_assignments', versionKey: false });

// ---------------------------------------------------------------------------
// teams
// ---------------------------------------------------------------------------
const teamSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  project_id: { type: Number, required: true },
  team_name: { type: String, required: true },
  client_id: { type: Number, default: null },
  created_at: { type: Date, default: Date.now }
}, { collection: 'teams', versionKey: false });

// ---------------------------------------------------------------------------
// team_members
// ---------------------------------------------------------------------------
const teamMemberSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  team_id: { type: Number, required: true, index: true },
  crew_id: { type: Number, required: true }
}, { collection: 'team_members', versionKey: false });

// ---------------------------------------------------------------------------
// servers
// ---------------------------------------------------------------------------
const serverSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  server_name: { type: String, required: true },
  ip: { type: String, default: '' },
  port: { type: String, default: '' },
  client_id: { type: Number, default: null },
  created_at: { type: Date, default: Date.now }
}, { collection: 'servers', versionKey: false });

// ---------------------------------------------------------------------------
// site_settings
// ---------------------------------------------------------------------------
const siteSettingSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  key: { type: String, unique: true, required: true },
  value: { type: String, default: '' }
}, { collection: 'site_settings', versionKey: false });

// ---------------------------------------------------------------------------
// password_reset_tokens
// ---------------------------------------------------------------------------
const passwordResetTokenSchema = new Schema({
  id: { type: Number, unique: true, required: true },
  token: { type: String, unique: true, required: true },
  user_id: { type: Number, default: null },
  crew_id: { type: Number, default: null },
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
  used: { type: Number, default: 0 }
}, { collection: 'password_reset_tokens', versionKey: false });

// Exports -------------------------------------------------------------------
module.exports = {
  IdCounter: mongoose.model('IdCounter', idCounterSchema),
  User: mongoose.model('User', userSchema),
  ApiKey: mongoose.model('ApiKey', apiKeySchema),
  CrewMember: mongoose.model('CrewMember', crewSchema),
  Department: mongoose.model('Department', departmentSchema),
  Project: mongoose.model('Project', projectSchema),
  Message: mongoose.model('Message', messageSchema),
  ProjectAssignment: mongoose.model('ProjectAssignment', projectAssignmentSchema),
  Team: mongoose.model('Team', teamSchema),
  TeamMember: mongoose.model('TeamMember', teamMemberSchema),
  Server: mongoose.model('Server', serverSchema),
  SiteSetting: mongoose.model('SiteSetting', siteSettingSchema),
  PasswordResetToken: mongoose.model('PasswordResetToken', passwordResetTokenSchema)
};

