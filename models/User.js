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
      // Sadece brand ve eventBrand için 5 kredi ver
      return (this.userType === 'brand' || this.userType === 'eventBrand') ? 5 : 0;
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
      enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför', 'Spor', 'Tatlı', 'Mobilya', 'El Sanatları', 'Çizim', 'Boyama', 'Konser', 'Sinema', 'Tiyatro', 'Sosyal Etkinlik', 'Spor Etkinliği', 'Market', 'Petrol Ofisi']
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
    enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför', 'Spor', 'Tatlı', 'Mobilya', 'El Sanatları', 'Boyama', 'Konser', 'Sinema', 'Tiyatro', 'Sosyal Etkinlik', 'Spor Etkinliği', 'Market', 'Petrol Ofisi'],
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
  bannerImage: {
    type: String,
    default: null
  },
  menuImage: {
    type: String,
    default: null
  },
  menuImages: [{
    type: String, // Menü görseli URL'leri (array)
    default: null
  }],
  menuLink: {
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
  // Oyunlaştırma Sistemi
  gamification: {
    // XP ve Seviye
    xp: {
      type: Number,
      default: 0,
      min: 0
    },
    level: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
      default: 'Bronze'
    },
    totalXp: {
      type: Number,
      default: 0,
      min: 0
    },
    // Rozetler ve Koleksiyonlar
    badges: [{
      badgeId: String,
      badgeName: String,
      category: String, // 'city', 'category', 'event', 'special'
      earnedAt: Date,
      description: String
    }],
    // Günlük Görevler ve Streak
    dailyTasks: {
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      lastTaskDate: Date,
      completedTasksToday: [String], // Görev ID'leri
      totalTasksCompleted: { type: Number, default: 0 }
    },
    // Marka Sadakati (her marka için puan)
    brandLoyalty: [{
      brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      brandName: String,
      points: { type: Number, default: 0 },
      visits: { type: Number, default: 0 },
      lastVisit: Date,
      rewards: [{
        rewardId: String,
        rewardName: String,
        earnedAt: Date,
        claimed: { type: Boolean, default: false }
      }]
    }],
    // Koleksiyonlar
    collections: [{
      collectionId: String,
      collectionName: String,
      category: String, // 'city', 'category', 'event'
      progress: { type: Number, default: 0 },
      total: Number,
      completed: { type: Boolean, default: false },
      completedAt: Date
    }]
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

// Seviye eşikleri (XP gereksinimleri)
const LEVEL_THRESHOLDS = {
  Bronze: 0,
  Silver: 100,
  Gold: 500,
  Platinum: 2000,
  Diamond: 10000
};

// Seviye avantajları
const LEVEL_BENEFITS = {
  Bronze: {
    name: 'Bronze',
    color: '#CD7F32',
    benefits: ['Temel kampanya erişimi']
  },
  Silver: {
    name: 'Silver',
    color: '#C0C0C0',
    benefits: ['Temel kampanya erişimi', 'Erken bildirimler']
  },
  Gold: {
    name: 'Gold',
    color: '#FFD700',
    benefits: ['Temel kampanya erişimi', 'Erken bildirimler', 'VIP etkinlik erişimi', '%5 ekstra indirim']
  },
  Platinum: {
    name: 'Platinum',
    color: '#E5E4E2',
    benefits: ['Temel kampanya erişimi', 'Erken bildirimler', 'VIP etkinlik erişimi', '%10 ekstra indirim', 'Özel rozetler']
  },
  Diamond: {
    name: 'Diamond',
    color: '#B9F2FF',
    benefits: ['Temel kampanya erişimi', 'Erken bildirimler', 'VIP etkinlik erişimi', '%15 ekstra indirim', 'Özel rozetler', 'Öncelikli destek', 'Özel etkinlik davetleri']
  }
};

// Seviye hesaplama metodu
userSchema.methods.calculateLevel = function() {
  const totalXp = this.gamification?.totalXp || 0;
  
  if (totalXp >= LEVEL_THRESHOLDS.Diamond) {
    return 'Diamond';
  } else if (totalXp >= LEVEL_THRESHOLDS.Platinum) {
    return 'Platinum';
  } else if (totalXp >= LEVEL_THRESHOLDS.Gold) {
    return 'Gold';
  } else if (totalXp >= LEVEL_THRESHOLDS.Silver) {
    return 'Silver';
  } else {
    return 'Bronze';
  }
};

// XP kazanma metodu
userSchema.methods.addXP = async function(amount, reason = '') {
  if (!this.gamification) {
    this.gamification = {
      xp: 0,
      level: 'Bronze',
      totalXp: 0,
      badges: [],
      dailyTasks: {
        currentStreak: 0,
        longestStreak: 0,
        completedTasksToday: [],
        totalTasksCompleted: 0
      },
      brandLoyalty: [],
      collections: []
    };
  }

  const oldLevel = this.gamification.level;
  const oldTotalXp = this.gamification.totalXp || 0;
  
  // XP ekle
  this.gamification.xp = (this.gamification.xp || 0) + amount;
  this.gamification.totalXp = (this.gamification.totalXp || 0) + amount;
  
  // Seviye hesapla
  const newLevel = this.calculateLevel();
  this.gamification.level = newLevel;
  
  // Seviye atladı mı kontrol et
  const levelUp = oldLevel !== newLevel;
  
  await this.save();
  
  return {
    xpGained: amount,
    totalXp: this.gamification.totalXp,
    oldLevel,
    newLevel,
    levelUp,
    reason
  };
};

// Seviye bilgisi getirme metodu
userSchema.methods.getLevelInfo = function() {
  const level = this.gamification?.level || 'Bronze';
  const totalXp = this.gamification?.totalXp || 0;
  const currentLevelThreshold = LEVEL_THRESHOLDS[level];
  const nextLevel = this.getNextLevel(level);
  const nextLevelThreshold = nextLevel ? LEVEL_THRESHOLDS[nextLevel] : null;
  const xpForNextLevel = nextLevelThreshold ? nextLevelThreshold - totalXp : null;
  const xpInCurrentLevel = totalXp - currentLevelThreshold;
  const xpNeededForNextLevel = nextLevelThreshold ? nextLevelThreshold - currentLevelThreshold : null;
  const progress = xpNeededForNextLevel ? (xpInCurrentLevel / xpNeededForNextLevel) * 100 : 100;
  
  return {
    level,
    totalXp,
    currentLevelThreshold,
    nextLevel,
    nextLevelThreshold,
    xpForNextLevel,
    xpInCurrentLevel,
    xpNeededForNextLevel,
    progress: Math.min(100, Math.max(0, progress)),
    benefits: LEVEL_BENEFITS[level]?.benefits || []
  };
};

// Sonraki seviyeyi bulma metodu
userSchema.methods.getNextLevel = function(currentLevel) {
  const levels = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  const currentIndex = levels.indexOf(currentLevel);
  return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : null;
};

// Rozet ekleme metodu
userSchema.methods.addBadge = async function(badgeId, badgeName, category, description = '') {
  if (!this.gamification) {
    this.gamification = {
      xp: 0,
      level: 'Bronze',
      totalXp: 0,
      badges: [],
      dailyTasks: {
        currentStreak: 0,
        longestStreak: 0,
        completedTasksToday: [],
        totalTasksCompleted: 0
      },
      brandLoyalty: [],
      collections: []
    };
  }

  // Rozet zaten var mı kontrol et
  const existingBadge = this.gamification.badges.find(b => b.badgeId === badgeId);
  if (existingBadge) {
    return { alreadyHas: true, badge: existingBadge };
  }

  // Yeni rozet ekle
  const newBadge = {
    badgeId,
    badgeName,
    category,
    earnedAt: new Date(),
    description
  };

  this.gamification.badges.push(newBadge);
  await this.save();

  return { alreadyHas: false, badge: newBadge };
};

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