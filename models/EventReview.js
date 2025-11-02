const mongoose = require('mongoose');

const eventReviewSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventTitle: {
    type: String,
    required: true
  },
  eventDescription: {
    type: String
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  userPhone: {
    type: String,
    required: true
  },
  userName: {
    type: String,
    default: 'Anonim Kullanıcı'
  },
  userProfilePhoto: {
    type: String
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    default: 5
  },
  comment: {
    type: String,
    maxlength: 500,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  helpful: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
eventReviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
eventReviewSchema.index({ event: 1, createdAt: -1 });
eventReviewSchema.index({ organizerId: 1 });
eventReviewSchema.index({ user: 1 });

module.exports = mongoose.model('EventReview', eventReviewSchema);

