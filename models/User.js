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
  age: {
    type: Number,
    default: null,
    min: 13,
    max: 120
  },
  gender: {
    type: String,
    enum: ['male', 'female'],
    default: null
  },
  profilePhoto: {
    type: String,
    default: null
  },
  instagram: {
    type: String,
    default: null,
    trim: true
  },
  userType: {
    type: String,
    enum: ['customer', 'brand', 'eventBrand', 'admin'],
    default: 'customer'
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  credits: {
    type: Number,
    default: function() {
      // Sadece brand ve eventBrand için 10 kredi ver
      return (this.userType === 'brand' || this.userType === 'eventBrand') ? 10 : 0;
    }
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  expoPushToken: {
    type: String,
    default: null
  },
  // FCM/APNs token (OneSignal yerine)
  pushToken: {
    type: String,
    default: null,
    index: true // Index ekle (sorgularda hızlı olması için)
  },
  pushPlatform: {
    type: String,
    enum: ['ios', 'android', null],
    default: null
  },
  pushTokenType: {
    type: String,
    enum: ['fcm', 'apns', null],
    default: null
  },
  oneSignalUserId: {
    type: String,
    default: null
  },
  oneSignalPlayerId: {
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
      enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför', 'Spor', 'Tatlı', 'Mobilya', 'El Sanatları', 'Çizim', 'Boyama', 'Konser', 'Sinema', 'Tiyatro', 'Sosyal Etkinlik', 'Spor Etkinliği', 'Market']
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
    enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför', 'Spor', 'Tatlı', 'Mobilya', 'El Sanatları', 'Boyama', 'Konser', 'Sinema', 'Tiyatro', 'Sosyal Etkinlik', 'Spor Etkinliği', 'Market'],
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
  // Marka lokasyon koordinatları (banner'lar için kullanılacak)
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
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
  // Açılış-Kapanış Saatleri
  openingHours: {
    monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
    sunday: { open: String, close: String, isOpen: { type: Boolean, default: true } }
  },
  // Restoran Özellikleri
  features: {
    hasChildrenPlayground: { type: Boolean, default: false },
    hasNonSmokingArea: { type: Boolean, default: false },
    hasParking: { type: Boolean, default: false },
    hasWifi: { type: Boolean, default: false },
    hasDelivery: { type: Boolean, default: false },
    hasTakeaway: { type: Boolean, default: false },
    hasOutdoorSeating: { type: Boolean, default: false },
    hasWheelchairAccess: { type: Boolean, default: false },
    acceptsReservations: { type: Boolean, default: false },
    acceptsCreditCard: { type: Boolean, default: false },
    hasLiveMusic: { type: Boolean, default: false },
    hasPetFriendly: { type: Boolean, default: false },
    hasValetParking: { type: Boolean, default: false },
    hasPrivateRoom: { type: Boolean, default: false },
    hasKidsMenu: { type: Boolean, default: false },
    hasVegetarianOptions: { type: Boolean, default: false },
    hasVeganOptions: { type: Boolean, default: false },
    hasGlutenFreeOptions: { type: Boolean, default: false },
    hasHalalOptions: { type: Boolean, default: false },
    // Özel özellikler (serbest metin)
    customFeatures: [{
      type: String
    }]
  },
  // İstatistikler
  statistics: {
    attendedEventsCount: { type: Number, default: 0 },
    usedCampaignsCount: { type: Number, default: 0 },
    totalSavings: { type: Number, default: 0 }
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

// Database index'leri (1M+ kullanıcı için performans)
// Segmentasyon sorgularını hızlandırmak için
userSchema.index({ city: 1 }); // Şehir filtreleme
userSchema.index({ 'preferences.city': 1 }); // Preferences şehir filtreleme
userSchema.index({ 'preferences.categories': 1 }); // Kategori filtreleme
userSchema.index({ category: 1 }); // Marka kategorisi filtreleme
userSchema.index({ pushPlatform: 1 }); // Platform filtreleme
userSchema.index({ pushTokenType: 1 }); // Token type filtreleme
// Composite index'ler (çoklu filtreleme için)
userSchema.index({ city: 1, 'preferences.categories': 1 }); // Şehir + kategori
userSchema.index({ 'preferences.city': 1, 'preferences.categories': 1 }); // Preferences şehir + kategori
userSchema.index({ pushToken: 1, pushPlatform: 1 }); // Token + platform (hızlı lookup)

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