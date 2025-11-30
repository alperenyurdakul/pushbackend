const mongoose = require('mongoose');

const EventQuestionSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  
  // Soruyu soran kullanıcı
  askedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  askedByName: {
    type: String,
    required: true
  },
  askedByProfilePhoto: {
    type: String,
    default: null
  },
  
  // Soru içeriği
  question: {
    type: String,
    required: true,
    trim: true
  },
  
  // Cevap (organizatör tarafından verilir)
  answer: {
    type: String,
    default: null,
    trim: true
  },
  answeredAt: {
    type: Date,
    default: null
  },
  
  // Durum
  status: {
    type: String,
    enum: ['pending', 'answered'],
    default: 'pending'
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

// Index'ler
EventQuestionSchema.index({ eventId: 1, createdAt: -1 });
EventQuestionSchema.index({ askedBy: 1 });
EventQuestionSchema.index({ status: 1 });

// Cevap verildiğinde updatedAt'i güncelle
EventQuestionSchema.pre('save', function(next) {
  if (this.isModified('answer') && this.answer) {
    this.answeredAt = new Date();
    this.status = 'answered';
  }
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('EventQuestion', EventQuestionSchema);

