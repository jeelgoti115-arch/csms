const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const db = require('../models');

const mongoURL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/csms';

(async () => {
  try {
    await mongoose.connect(mongoURL);
    console.log('Connected to', mongoURL);
    const usersCount = await db.User.countDocuments();
    const vehiclesCount = await db.Vehicle.countDocuments();
    const servicesCount = await db.Service.countDocuments();
    const contactsCount = await db.Contact.countDocuments();
    console.log({ usersCount, vehiclesCount, servicesCount, contactsCount });
    const userSample = await db.User.findOne().lean();
    const vehicleSample = await db.Vehicle.findOne().lean();
    console.log('sampleUser:', userSample);
    console.log('sampleVehicle:', vehicleSample);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();