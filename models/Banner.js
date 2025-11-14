const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
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
  // AI tarafından oluşturulan banner metni
  aiGeneratedText: {
    type: String,
    required: true
  },
  // Banner görseli (AI tarafından oluşturulacak)
  bannerImage: {
    type: String, // URL to generated banner image
    default: null
  },
  // Menü bilgileri
  menu: {
    link: {
      type: String, // Menü linki
      default: null
    },
    image: {
      type: String, // Menü görseli URL'si
      default: null
    }
  },
  // Kampanya detayları
  campaign: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    startTime: {
      type: String, // "18:00" formatında
      required: true
    },
    endTime: {
      type: String, // "23:00" formatında
      required: true
    },
    daysOfWeek: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  // Hedef kitle ve koşullar
  targetAudience: {
    ageRange: {
      min: Number,
      max: Number
    },
    gender: {
      type: String,
      enum: ['all', 'male', 'female']
    },
    location: {
      radius: Number, // km cinsinden
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  },
  // Banner lokasyon bilgileri
  bannerLocation: {
    city: String,
    district: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  // Banner kategorisi
  category: {
    type: String,
    enum: ['Kahve', 'Yiyecek', 'Bar/Pub', 'Giyim', 'Kuaför', 'Spor', 'Tatlı', 'Mobilya', 'El Sanatları', 'Çizim', 'Boyama', 'Konser', 'Sinema', 'Tiyatro', 'Sosyal Etkinlik', 'Spor Etkinliği', 'Market'],
    default: 'Kahve'
  },
  // Banner istatistikleri
  stats: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    conversions: {
      type: Number,
      default: 0
    }
  },
  // AI model bilgileri
  aiModel: {
    model: String,
    version: String,
    generationDate: {
      type: Date,
      default: Date.now
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'paused', 'completed', 'archived'],
    default: 'draft'
  },
  // Admin onay durumu
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectedReason: {
    type: String,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  // Banner türü - etkinlik mi yoksa normal kampanya mı
  contentType: {
    type: String,
    enum: ['campaign', 'event'],
    default: 'campaign'
  },
  // Kampanya detayları - indirim/ikram/sabit fiyat
  offerType: {
    type: String,
    enum: ['percentage', 'fixedPrice', 'freeItem'], // Yüzde indirim, Sabit fiyat, Bedava ürün
    default: 'percentage'
  },
  offerDetails: {
    // Yüzde indirim için
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    // Sabit fiyat kampanyaları için
    originalPrice: {
      type: Number,
      min: 0,
      default: null
    },
    discountedPrice: {
      type: Number,
      min: 0,
      default: null
    },
    // Bedava ürün kampanyaları için
    freeItemName: {
      type: String,
      default: null,
      trim: true
    },
    freeItemCondition: {
      type: String,
      default: null,
      trim: true
    }
  },
  // Kod kotası bilgileri
  codeQuota: {
    total: {
      type: Number,
      default: 10
    },
    used: {
      type: Number,
      default: 0
    },
    remaining: {
      type: Number,
      default: 10
    }
  },
  // Kod tipi ve sabit kod bilgileri
  codeSettings: {
    codeType: {
      type: String,
      enum: ['random', 'fixed'],
      default: 'random'
    },
    fixedCode: {
      type: String,
      default: null,
      validate: {
        validator: function(v) {
          // Sabit kod seçildiyse kod zorunlu
          if (this.codeSettings?.codeType === 'fixed') {
            // Alfanumerik, 4-20 karakter arası
            return v && v.length >= 4 && v.length <= 20 && /^[a-zA-Z0-9]+$/.test(v);
          }
          return true;
        },
        message: 'Sabit kod 4-20 karakter arası harf ve rakamlardan oluşmalıdır'
      }
    }
  },
  // Marka profil bilgileri
  brandProfile: {
    logo: String,
    description: String,
    category: String,
    brandType: String,
    email: String,
    address: String,
    city: String,
    district: String
  },
  // Yorumlar ve puanlama
  reviews: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userName: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
bannerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for better query performance
bannerSchema.index({ restaurant: 1, 'campaign.isActive': 1 });
bannerSchema.index({ 'campaign.startDate': 1, 'campaign.endDate': 1 });

module.exports = mongoose.model('Banner', bannerSchema); 