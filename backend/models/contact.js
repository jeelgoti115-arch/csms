const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, trim: true, default: '' },
  problemType: { type: String },
  description: { type: String },
  status: { type: String, enum: ['new', 'in-progress', 'resolved', 'responded'], default: 'new' },
  adminResponse: { type: String, default: '' },
  respondedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
