const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // firstName: { type: String, default: '' },
  // lastName: { type: String, default: '' },
  // username: { type: String, default: '' },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer', enum: ['customer', 'technician', 'advisor', 'receptionist', 'admin', 'qc', 'guard'] },
  status: { type: String, default: 'active', enum: ['active', 'inactive'] },
  phone: { type: String, default: '' },
  specialization: { type: String, default: '' },
  sessionToken: { type: String, default: null },
  sessionExpiresAt: { type: Date, default: null },
  avatar: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
