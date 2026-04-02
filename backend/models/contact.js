const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, trim: true, default: '' },
  problemType: { type: String },
  description: { type: String },
  status: { type: String, default: 'new', enum: ['new', 'in-progress', 'resolved'] },
  adminResponse: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema);
