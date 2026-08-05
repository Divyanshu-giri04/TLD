// ---------------------------------------------------------------------------
// src/client/schemas/message.schema.js
// Zod validation for client messages.
// ---------------------------------------------------------------------------
const { z } = require('zod');

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content is required').max(5000)
});

module.exports = { sendMessageSchema };
