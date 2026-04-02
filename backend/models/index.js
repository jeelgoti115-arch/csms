const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoURL = process.env.MONGO_URL || 'mongodb://localhost:27017/jeel';

const db = {};

// Connect to MongoDB
mongoose.connect(mongoURL)
  .then(() => {
    console.log('MongoDB connected to:', mongoURL);
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

db.mongoose = mongoose;
db.User = require('./user');
db.Service = require('./service');
db.Appointment = require('./appointment');
db.Vehicle = require('./vehicle');
db.Contact = require('./contact');
db.Session = require('./session');

module.exports = db;
