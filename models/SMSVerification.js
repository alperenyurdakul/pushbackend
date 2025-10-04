const mongoose = require('mongoose');

const smsVerificationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 60 * 1000), // 5 dakika
    expires: 300 // MongoDB TTL
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
smsVerificationSchema.index({ phone: 1 });
smsVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SMSVerification', smsVerificationSchema);
