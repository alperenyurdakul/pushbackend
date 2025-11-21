const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Banner = require('../models/Banner');
const CodeHistory = require('../models/CodeHistory');
const Restaurant = require('../models/Restaurant');
const BannerClick = require('../models/BannerClick');

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

// Banner tıklamaları ve görüntülenmeler için istatistikler
router.get('/banner-stats', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    const { days = 30 } = req.query;
    
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

    // Banner tıklamalarını getir
    const bannerClicks = await BannerClick.find({
      restaurant: restaurant._id,
      timestamp: { $gte: startDate }
    }).populate('banner', 'title').populate('user', 'name phone');

    // Action'lara göre grupla
    const statsByAction = {};
    const statsByBanner = {};
    
    bannerClicks.forEach(click => {
      const action = click.action;
      const bannerId = click.banner?._id?.toString() || 'unknown';
      
      // Action bazında
      if (!statsByAction[action]) {
        statsByAction[action] = 0;
      }
      statsByAction[action]++;
      
      // Banner bazında
      if (!statsByBanner[bannerId]) {
        statsByBanner[bannerId] = {
          bannerId,
          bannerTitle: click.banner?.title || 'Bilinmeyen',
          views: 0,
          clicks: 0,
          likes: 0,
          shares: 0,
          calls: 0,
          directions: 0,
          totalActions: 0
        };
      }
      
      statsByBanner[bannerId][action + 's'] = (statsByBanner[bannerId][action + 's'] || 0) + 1;
      statsByBanner[bannerId].totalActions++;
    });

    // Eğer BannerClick kaydı yoksa, Banner.stats'tan da veri çek (fallback)
    if (bannerClicks.length === 0) {
      banners.forEach(banner => {
        const bannerId = banner._id.toString();
        if (!statsByBanner[bannerId]) {
          statsByBanner[bannerId] = {
            bannerId,
            bannerTitle: banner.title || 'Bilinmeyen',
            views: banner.stats?.views || 0,
            clicks: banner.stats?.clicks || 0,
            likes: 0,
            shares: 0,
            calls: 0,
            directions: 0,
            totalActions: (banner.stats?.views || 0) + (banner.stats?.clicks || 0)
          };
        }
      });
    }

    // Toplam istatistikler
    const totalViews = statsByAction.view || banners.reduce((sum, b) => sum + (b.stats?.views || 0), 0);
    const totalClicks = statsByAction.click || banners.reduce((sum, b) => sum + (b.stats?.clicks || 0), 0);
    const totalLikes = statsByAction.like || 0;
    const totalShares = statsByAction.share || 0;
    const totalCalls = statsByAction.call || 0;
    const totalDirections = statsByAction.directions || 0;
    
    // Unique kullanıcı sayısı
    const uniqueUsers = [...new Set(bannerClicks.map(c => c.user?._id?.toString()).filter(Boolean))];

    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: new Date(),
          days: parseInt(days)
        },
        totals: {
          views: totalViews,
          clicks: totalClicks,
          likes: totalLikes,
          shares: totalShares,
          calls: totalCalls,
          directions: totalDirections,
          uniqueUsers: uniqueUsers.length,
          clickThroughRate: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100 * 100) / 100 : 0
        },
        byAction: statsByAction,
        byBanner: Object.values(statsByBanner).sort((a, b) => b.totalActions - a.totalActions)
      }
    });
  } catch (error) {
    console.error('Banner stats hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner istatistikleri alınırken hata oluştu!',
      error: error.message
    });
  }
});

// QR kod oluşturma istatistikleri
router.get('/qr-stats', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    const { days = 30 } = req.query;
    
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

    // QR kod geçmişini getir
    const qrCodes = await CodeHistory.find({
      bannerId: { $in: bannerIds },
      createdAt: { $gte: startDate }
    }).populate('bannerId', 'title').populate('userId', 'name phone');

    // Banner bazında grupla
    const statsByBanner = {};
    let totalGenerated = 0;
    let totalUsed = 0;
    const uniqueUsers = new Set();

    qrCodes.forEach(code => {
      const bannerId = code.bannerId?._id?.toString() || 'unknown';
      const userId = code.userId?._id?.toString();
      
      if (userId) uniqueUsers.add(userId);
      
      if (!statsByBanner[bannerId]) {
        statsByBanner[bannerId] = {
          bannerId,
          bannerTitle: code.bannerId?.title || 'Bilinmeyen',
          generated: 0,
          used: 0,
          unused: 0,
          conversionRate: 0
        };
      }
      
      statsByBanner[bannerId].generated++;
      totalGenerated++;
      
      if (code.used) {
        statsByBanner[bannerId].used++;
        totalUsed++;
      } else {
        statsByBanner[bannerId].unused++;
      }
    });

    // Conversion rate hesapla
    Object.keys(statsByBanner).forEach(bannerId => {
      const stats = statsByBanner[bannerId];
      stats.conversionRate = stats.generated > 0 
        ? Math.round((stats.used / stats.generated) * 100 * 100) / 100 
        : 0;
    });

    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: new Date(),
          days: parseInt(days)
        },
        totals: {
          generated: totalGenerated,
          used: totalUsed,
          unused: totalGenerated - totalUsed,
          uniqueUsers: uniqueUsers.size,
          conversionRate: totalGenerated > 0 
            ? Math.round((totalUsed / totalGenerated) * 100 * 100) / 100 
            : 0
        },
        byBanner: Object.values(statsByBanner).sort((a, b) => b.generated - a.generated)
      }
    });
  } catch (error) {
    console.error('QR stats hatası:', error);
    res.status(500).json({
      success: false,
      message: 'QR kod istatistikleri alınırken hata oluştu!',
      error: error.message
    });
  }
});

// Genel istatistikler (tüm metrikleri birleştir)
router.get('/overview', authenticateJWT, async (req, res) => {
  try {
    const user = req.user;
    const { days = 30 } = req.query;
    
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

    // Paralel olarak tüm verileri çek
    const [bannerClicks, qrCodes] = await Promise.all([
      BannerClick.find({
        restaurant: restaurant._id,
        timestamp: { $gte: startDate }
      }),
      CodeHistory.find({
        bannerId: { $in: bannerIds },
        createdAt: { $gte: startDate }
      })
    ]);

    // Banner tıklamaları istatistikleri
    let totalViews = bannerClicks.filter(c => c.action === 'view').length;
    let totalClicks = bannerClicks.filter(c => c.action === 'click').length;
    
    // Eğer BannerClick kaydı yoksa, Banner.stats'tan veri çek (fallback)
    if (bannerClicks.length === 0) {
      totalViews = banners.reduce((sum, b) => sum + (b.stats?.views || 0), 0);
      totalClicks = banners.reduce((sum, b) => sum + (b.stats?.clicks || 0), 0);
    }
    
    const uniqueClickUsers = [...new Set(bannerClicks.filter(c => c.action === 'click').map(c => c.user?.toString()).filter(Boolean))];

    // QR kod istatistikleri
    const totalQRCodes = qrCodes.length;
    const usedQRCodes = qrCodes.filter(c => c.used).length;
    const uniqueQRUsers = [...new Set(qrCodes.map(c => c.userId?.toString()).filter(Boolean))];

    res.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: new Date(),
          days: parseInt(days)
        },
        banners: {
          total: banners.length,
          active: banners.filter(b => b.status === 'active').length
        },
        clicks: {
          views: totalViews,
          clicks: totalClicks,
          clickThroughRate: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100 * 100) / 100 : 0,
          uniqueUsers: uniqueClickUsers.length
        },
        qrCodes: {
          generated: totalQRCodes,
          used: usedQRCodes,
          unused: totalQRCodes - usedQRCodes,
          conversionRate: totalQRCodes > 0 ? Math.round((usedQRCodes / totalQRCodes) * 100 * 100) / 100 : 0,
          uniqueUsers: uniqueQRUsers.length
        }
      }
    });
  } catch (error) {
    console.error('Overview stats hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Genel istatistikler alınırken hata oluştu!',
      error: error.message
    });
  }
});

console.log('🔧 Analytics Routes kayıtlı:');
console.log('  - GET /analytics/brand-weekly');
console.log('  - GET /analytics/brand-daily');
console.log('  - GET /analytics/banner-stats');
console.log('  - GET /analytics/qr-stats');
console.log('  - GET /analytics/overview');

module.exports = router;

