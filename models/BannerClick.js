const mongoose = require('mongoose');

const bannerClickSchema = new mongoose.Schema({
  banner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Banner',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  action: {
    type: String,
    enum: ['view', 'click', 'like', 'share', 'call', 'directions'],
    required: true
  },
  deviceInfo: {
    platform: String, // 'ios', 'android'
    version: String,
    model: String
  },
  location: {
    city: String,
    district: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  sessionDuration: Number, // Banner'ı ne kadar süre görüntüledi (saniye)
  userAgent: String,
  ipAddress: String
});

// Indexes for better query performance
bannerClickSchema.index({ banner: 1, timestamp: -1 });
bannerClickSchema.index({ user: 1, timestamp: -1 });
bannerClickSchema.index({ restaurant: 1, timestamp: -1 });
bannerClickSchema.index({ action: 1, timestamp: -1 });
bannerClickSchema.index({ timestamp: -1 });

module.exports = mongoose.model('BannerClick', bannerClickSchema); 