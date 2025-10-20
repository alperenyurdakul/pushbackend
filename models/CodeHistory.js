const mongoose = require('mongoose');

const codeHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    index: true
  },
  bannerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true
  },
  // Hesap tutarları
  billAmount: {
    originalAmount: {
      type: Number,
      default: null
    },
    discountedAmount: {
      type: Number,
      default: null
    },
    savedAmount: {
      type: Number,
      default: null
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  used: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date,
    default: null
  }
});

// Compound index: userId + bannerId + createdAt (her banner için günde bir kez kontrol için)
codeHistorySchema.index({ userId: 1, bannerId: 1, createdAt: 1 });

// TTL index: 24 saat sonra silinsin
codeHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('CodeHistory', codeHistorySchema);
