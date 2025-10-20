const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Banner = require('../models/Banner');
const CodeHistory = require('../models/CodeHistory');
const Restaurant = require('../models/Restaurant');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// JWT Middleware
const authenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme token\'ı gerekli!'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('JWT doğrulama hatası:', error);
    res.status(401).json({
      success: false,
      message: 'Geçersiz token!'
    });
  }
};

// Marka için haftalık analitik
router.get('/brand-weekly', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    
    // Kullanıcının restoranını bul
    const restaurant = await Restaurant.findOne({ name: user.name });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    // Kullanıcının banner'larını bul
    const banners = await Banner.find({ restaurant: restaurant._id });
    const bannerIds = banners.map(b => b._id);

    // Son 7 günün başlangıcı
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);

    // Son 7 gündeki kod kullanımları
    const weeklyCodeHistory = await CodeHistory.find({
      bannerId: { $in: bannerIds },
      createdAt: { $gte: oneWeekAgo }
    }).populate('userId', 'name phone');

    // Kullanılmış kodlar
    const usedCodes = weeklyCodeHistory.filter(c => c.used);

    // Toplam müşteri sayısı (unique)
    const uniqueCustomers = [...new Set(weeklyCodeHistory.map(c => c.phone))];
    const uniqueUsedCustomers = [...new Set(usedCodes.map(c => c.phone))];

    // Toplam indirim ve ciro hesaplama
    let totalDiscountGiven = 0;
    let totalRevenue = 0; // Ödenecek tutarlar toplamı
    let totalOriginalAmount = 0; // Toplam hesap tutarları

    usedCodes.forEach(code => {
      if (code.billAmount) {
        totalOriginalAmount += code.billAmount.originalAmount || 0;
        totalRevenue += code.billAmount.discountedAmount || 0;
        totalDiscountGiven += code.billAmount.savedAmount || 0;
      }
    });

    // Kampanya tiplerine göre dağılım
    const offerTypeDistribution = {};
    banners.forEach(banner => {
      const type = banner.offerType || 'percentage';
      offerTypeDistribution[type] = (offerTypeDistribution[type] || 0) + 1;
    });

    // En çok kullanılan kampanya
    const campaignUsage = {};
    usedCodes.forEach(code => {
      const bannerId = code.bannerId.toString();
      campaignUsage[bannerId] = (campaignUsage[bannerId] || 0) + 1;
    });

    const topCampaignId = Object.keys(campaignUsage).reduce((a, b) => 
      campaignUsage[a] > campaignUsage[b] ? a : b, null
    );
    
    const topCampaign = topCampaignId ? await Banner.findById(topCampaignId) : null;

    console.log('📊 Haftalık analitik hesaplandı:', {
      restaurantName: restaurant.name,
      totalCodes: weeklyCodeHistory.length,
      usedCodes: usedCodes.length,
      totalRevenue,
      totalDiscountGiven
    });

    res.json({
      success: true,
      data: {
        period: {
          start: oneWeekAgo,
          end: new Date(),
          days: 7
        },
        codes: {
          total: weeklyCodeHistory.length,
          used: usedCodes.length,
          unused: weeklyCodeHistory.length - usedCodes.length,
          conversionRate: weeklyCodeHistory.length > 0 
            ? Math.round((usedCodes.length / weeklyCodeHistory.length) * 100) 
            : 0
        },
        customers: {
          totalUnique: uniqueCustomers.length,
          usedCode: uniqueUsedCustomers.length
        },
        revenue: {
          totalOriginalAmount: Math.round(totalOriginalAmount * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalDiscountGiven: Math.round(totalDiscountGiven * 100) / 100
        },
        campaigns: {
          total: banners.length,
          active: banners.filter(b => b.status === 'active').length,
          offerTypeDistribution: offerTypeDistribution,
          topCampaign: topCampaign ? {
            id: topCampaign._id,
            title: topCampaign.title,
            usage: campaignUsage[topCampaignId],
            offerType: topCampaign.offerType
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Analytics hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Analitik verileri alınırken hata oluştu!',
      error: error.message
    });
  }
});

// Günlük analitik (son 30 gün, günlük dağılım)
router.get('/brand-daily', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    const { days = 30 } = req.query; // Varsayılan 30 gün
    
    // Kullanıcının restoranını bul
    const restaurant = await Restaurant.findOne({ name: user.name });
    
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    // Kullanıcının banner'larını bul
    const banners = await Banner.find({ restaurant: restaurant._id });
    const bannerIds = banners.map(b => b._id);

    // Son N günün başlangıcı
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    // Kod kullanımları
    const codeHistory = await CodeHistory.find({
      bannerId: { $in: bannerIds },
      createdAt: { $gte: startDate }
    });

    // Günlük dağılım
    const dailyStats = {};
    for (let i = 0; i < parseInt(days); i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyStats[dateKey] = { codes: 0, used: 0, revenue: 0, discount: 0 };
    }

    codeHistory.forEach(code => {
      const dateKey = code.createdAt.toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].codes += 1;
        if (code.used) {
          dailyStats[dateKey].used += 1;
          if (code.billAmount) {
            dailyStats[dateKey].revenue += code.billAmount.discountedAmount || 0;
            dailyStats[dateKey].discount += code.billAmount.savedAmount || 0;
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: new Date(),
          days: parseInt(days)
        },
        dailyStats: dailyStats
      }
    });
  } catch (error) {
    console.error('Daily analytics hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Günlük analitik verileri alınırken hata oluştu!',
      error: error.message
    });
  }
});

console.log('🔧 Analytics Routes kayıtlı:');
console.log('  - GET /analytics/brand-weekly');
console.log('  - GET /analytics/brand-daily');

module.exports = router;

