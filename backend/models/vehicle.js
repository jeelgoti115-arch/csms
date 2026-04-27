const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  plate: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: value => /^(?=.*[A-Za-z])[A-Za-z0-9]{10}$/.test(value),
      message: 'Plate must be exactly 10 alphanumeric characters and contain at least one letter'
    }
  },
  owner: { type: String, required: true, trim: true },
  ownerEmail: { type: String, trim: true, default: '' },
  mobileNumber: { type: String, trim: true, default: '' },
  make: { type: String },
  model: { type: String },
  year: { type: Number },
  color: { type: String },
  assignedAdvisor: { type: String, default: null },
  qcAssignedTo: { type: String, default: null },
  qcAssignedToName: { type: String, default: null },
  qcAssignedToEmail: { type: String, default: null },
  qcAssignedToId: { type: String, default: null },
  serviceStatus: { type: String, default: 'entered', enum: ['entered', 'assigned', 'inspected', 'pending', 'in-progress', 'completed', 'awaiting-qc', 'in-qc', 'ready-for-delivery', 'delivered'] },
  inspectionStatus: { type: String, default: 'not-started', enum: ['not-started', 'in-progress', 'completed'] },
  inspectionReport: { type: mongoose.Schema.Types.Mixed, default: null },
  serviceDescription: { type: String, default: '' },
  jobs: {
    type: [new mongoose.Schema({
      id: String,
      type: String,
      description: String,
      estimatedHours: Number,
      estimatedCost: Number,
      technician: String,
      technicianId: String,
      status: { type: String, default: 'pending' },
      assignedDate: Date,
      serviceName: String,
      startTime: Date,
      completionTime: Date,
      pauseTime: Date,
      resumeTime: Date,
      startTimestamp: Number,
      totalServiceTime: Number,
      actualTime: Number
    }, { _id: false })],
    default: []
  },
  jobsAssigned: { type: Boolean, default: false },
  qcStatus: { type: String, default: null },
  qcNotes: { type: String, default: null },
  qcPriority: { type: String, default: null },
  vehicleRejected: { type: Boolean, default: false },
  reworkJobs: { type: [String], default: [] },
  totalServiceTime: { type: Number, default: null },
  totalCost: { type: Number, default: null },
  serviceStartTime: { type: Date, default: null },
  serviceCompletionTime: { type: Date, default: null },
  sentToQcTime: { type: Date, default: null },
  status: { type: String, default: 'entered', enum: ['entered', 'exit'] },
  createdBy: { type: String },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  history: [{
    at: { type: Date, default: Date.now },
    by: String,
    note: String,
    changes: mongoose.Schema.Types.Mixed
  }]
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
