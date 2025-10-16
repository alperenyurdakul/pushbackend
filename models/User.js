const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  userType: {
    type: String,
    enum: ['customer', 'brand'],
    default: 'customer'
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  expoPushToken: {
    type: String,
    default: null
  },
  oneSignalUserId: {
    type: String,
    default: null
  },
  oneSignalExternalId: {
    type: String,
    default: null
  },
  // Kullanıcı tercihleri (müşteriler için)
  preferences: {
    city: {
      type: String,
      default: null,
      trim: true
    },
    categories: [{
      type: String,
      enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför','Spor']
    }]
  },
  // Marka profil bilgileri
  email: {
    type: String,
    default: null,
    trim: true
  },
  brandType: {
    type: String,
    default: null,
    trim: true
  },
  description: {
    type: String,
    default: null,
    trim: true
  },
  category: {
    type: String,
    enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför','Spor'],
    default: 'Kahve'
  },
  address: {
    type: String,
    default: null,
    trim: true
  },
  city: {
    type: String,
    default: null, // Varsayılan şehir yok, kullanıcı seçmeli
    trim: true
  },
  district: {
    type: String,
    default: null, // Varsayılan district yok
    trim: true
  },
  logo: {
    type: String,
    default: null
  },
  restaurant: {
    name: {
      type: String,
      default: null
    },
    type: {
      type: String,
      default: 'restaurant'
    }
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

// Şifre hash'leme
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Şifre karşılaştırma
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema); 