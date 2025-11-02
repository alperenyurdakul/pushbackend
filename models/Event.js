const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  // Organizer bilgileri
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizerName: {
    type: String,
    required: true,
    trim: true
  },
  organizerProfilePhoto: {
    type: String,
    default: null
  },
  
  // Etkinlik bilgileri
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  bannerImage: {
    type: String,
    default: null
  },
  
  // Tarih ve saat bilgileri
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  
  // Lokasyon bilgileri
  location: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: String,
    city: String,
    district: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  
  // Katılım bilgileri
  participantLimit: {
    type: Number,
    default: null // null = sınırsız
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: String,
    userProfilePhoto: String,
    phone: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'attended'],
      default: 'pending'
    },
    appliedAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: Date,
    attendedAt: Date,
    qrCode: {
      type: String,
      default: null
    },
    qrVerifiedAt: Date
  }],
  
  // Admin onay sistemi
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  approvedAt: Date,
  rejectedAt: Date,
  rejectedReason: String,
  
  // Status (etkinlik durumu)
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
    default: 'upcoming'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// QR kod oluşturma fonksiyonu
EventSchema.methods.generateQRCode = function(userId) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(`${this._id}-${userId}-${Date.now()}`).digest('hex');
  return hash.substring(0, 32);
};

// Index'ler
EventSchema.index({ organizerId: 1 });
EventSchema.index({ approvalStatus: 1 });
EventSchema.index({ status: 1 });
EventSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Event', EventSchema);
