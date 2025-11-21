const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    default: null,
    trim: true
  },
  description: {
    type: String,
    default: null,
    trim: true
  },
  image: {
    type: String,
    default: null
  }
});

const menuSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  menuUrl: {
    type: String,
    required: true,
    trim: true
  },
  items: [menuItemSchema],
  lastScrapedAt: {
    type: Date,
    default: null
  },
  scrapingStatus: {
    type: String,
    enum: ['pending', 'success', 'failed', 'processing'],
    default: 'pending'
  },
  scrapingError: {
    type: String,
    default: null
  },
  scrapingMethod: {
    type: String,
    enum: ['puppeteer', 'cheerio', 'manual', 'api'],
    default: 'puppeteer'
  },
  // Menü metadata
  metadata: {
    totalItems: {
      type: Number,
      default: 0
    },
    averagePrice: {
      type: Number,
      default: 0
    },
    minPrice: {
      type: Number,
      default: 0
    },
    maxPrice: {
      type: Number,
      default: 0
    },
    categories: [{
      type: String
    }]
  },
  // Fiyat değişiklik takibi
  priceHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    totalItems: Number,
    averagePrice: Number,
    priceChanges: [{
      itemName: String,
      oldPrice: Number,
      newPrice: Number
    }]
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

// Index'ler
menuSchema.index({ restaurant: 1 });
menuSchema.index({ lastScrapedAt: -1 });
menuSchema.index({ scrapingStatus: 1 });

// Update timestamp
menuSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Metadata'yı otomatik hesapla
  if (this.items && this.items.length > 0) {
    const prices = this.items.map(item => item.price).filter(p => p > 0);
    if (prices.length > 0) {
      this.metadata.totalItems = this.items.length;
      this.metadata.averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      this.metadata.minPrice = Math.min(...prices);
      this.metadata.maxPrice = Math.max(...prices);
      
      // Kategorileri topla
      const categories = [...new Set(this.items.map(item => item.category).filter(c => c))];
      this.metadata.categories = categories;
    }
  }
  
  next();
});

module.exports = mongoose.model('Menu', menuSchema);

