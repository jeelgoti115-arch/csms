const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  text: { type: String, required: true },
  senderName: { type: String, required: true },
  senderId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
