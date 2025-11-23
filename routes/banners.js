const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const BannerClick = require('../models/BannerClick');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { findNearbyBanners } = require('../services/locationService');

// GET all banners
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find()
      .populate('restaurant')
      .sort({ createdAt: -1 }); // En yeni banner'lar önce gelsin
    res.json({
      success: true,
      data: banners
    });
  } catch (error) {
    console.error('Banner\'lar listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// GET active banners
router.get('/active', async (req, res) => {
  try {
    const activeBanners = await Banner.find({ status: 'active' })
      .populate('restaurant')
      .sort({ createdAt: -1 }); // En yeni banner'lar önce gelsin
    
    res.json({
      success: true,
      data: activeBanners
    });
  } catch (error) {
    console.error('Aktif banner\'lar listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Aktif banner\'lar listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// GET banners by restaurant ID
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const banners = await Banner.find({ 
      restaurant: req.params.restaurantId,
      status: 'active' 
    })
      .populate('restaurant')
      .sort({ createdAt: -1 }); // En yeni banner'lar önce gelsin
    
    res.json({
      success: true,
      data: banners
    });
  } catch (error) {
    console.error('Restoran banner\'ları listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran banner\'ları listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// GET banner by ID
router.get('/:id', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id).populate('restaurant');
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    res.json({
      success: true,
      data: banner
    });
  } catch (error) {
    console.error('Banner getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner getirilirken hata oluştu!',
      error: error.message
    });
  }
});

// POST new banner (basit)
router.post('/', async (req, res) => {
  try {
    const banner = new Banner(req.body);
    await banner.save();
    res.status(201).json({
      success: true,
      message: 'Banner başarıyla oluşturuldu!',
      data: banner
    });
  } catch (error) {
    console.error('Banner oluşturulurken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner oluşturulurken hata oluştu!',
      error: error.message
    });
  }
});

// POST /create-simple - Marka profilinden sabit banner oluştur
router.post('/create-simple', async (req, res) => {
  try {
    // JWT token kontrolü
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Giriş yapmanız gerekiyor!'
      });
    }

    let user = null;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Kullanıcı bulunamadı!'
        });
      }
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token!'
      });
    }

    // Sadece marka kullanıcıları banner oluşturabilir
    if (user.userType !== 'brand' && user.userType !== 'eventBrand') {
      return res.status(403).json({
        success: false,
        message: 'Sadece marka kullanıcıları banner oluşturabilir!'
      });
    }

    // Restaurant oluştur veya bul
    let restaurant = await Restaurant.findOne({ name: user.name });
    
    if (!restaurant) {
      restaurant = new Restaurant({
        name: user.name,
        type: 'restaurant',
        address: {
          street: user.address || null,
          city: user.city || 'İstanbul',
          district: user.district || null,
          coordinates: user.latitude && user.longitude ? {
            lat: user.latitude,
            lng: user.longitude
          } : null
        },
        contact: {
          phone: user.phone,
          email: user.email || null
        },
        workingHours: {
          monday: { open: '09:00', close: '22:00' },
          tuesday: { open: '09:00', close: '22:00' },
          wednesday: { open: '09:00', close: '22:00' },
          thursday: { open: '09:00', close: '22:00' },
          friday: { open: '09:00', close: '23:00' },
          saturday: { open: '10:00', close: '23:00' },
          sunday: { open: '10:00', close: '22:00' }
        },
        logo: user.logo || null,
        description: user.description || `${user.name} restoranı`,
        isActive: true
      });
      
      await restaurant.save();
      console.log('✅ Restaurant oluşturuldu:', restaurant._id);
    }

    // Request body'den banner bilgilerini al
    const { title, description, startDate, endDate, discountPercentage, codeQuota } = req.body;

    // Varsayılan değerler
    const bannerStartDate = startDate ? new Date(startDate) : new Date();
    const bannerEndDate = endDate ? new Date(endDate) : (() => {
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    })();

    // Sabit Banner oluştur
    const simpleBanner = new Banner({
      restaurant: restaurant._id,
      title: title || `${user.name} Kampanyası`,
      description: description || `${user.name} olarak özel kampanyamızdan yararlanın!`,
      aiGeneratedText: description || `${user.name} markası için özel kampanya. Müşterilerimize özel indirimler ve fırsatlar.`,
      bannerImage: null, // Görsel sonradan eklenebilir
      campaign: {
        startDate: bannerStartDate,
        endDate: bannerEndDate,
        startTime: '09:00',
        endTime: '23:00',
        daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        isActive: true
      },
      category: user.category || 'Kahve',
      bannerLocation: {
        city: user.city || 'İstanbul',
        district: user.district || null,
        address: user.address || null,
        coordinates: user.latitude && user.longitude ? {
          latitude: user.latitude,
          longitude: user.longitude
        } : null
      },
      brandProfile: {
        logo: user.logo || null,
        description: user.description || `${user.name} markası`,
        category: user.category || 'Kahve',
        brandType: user.brandType || 'Restoran',
        email: user.email || null,
        address: user.address || null,
        city: user.city || 'İstanbul',
        district: user.district || null
      },
      status: 'active',
      approvalStatus: 'pending', // Admin onayı bekliyor
      offerType: 'percentage',
      offerDetails: {
        discountPercentage: discountPercentage || 10
      },
      codeQuota: {
        total: codeQuota || 100,
        used: 0,
        remaining: codeQuota || 100
      },
      codeSettings: {
        codeType: 'random',
        fixedCode: null
      },
      stats: {
        views: 0,
        clicks: 0,
        conversions: 0
      }
    });

    await simpleBanner.save();
    console.log('✅ Sabit banner oluşturuldu:', simpleBanner._id);

    res.status(201).json({
      success: true,
      message: 'Banner başarıyla oluşturuldu! Admin onayı bekleniyor.',
      data: simpleBanner
    });
  } catch (error) {
    console.error('Sabit banner oluşturulurken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner oluşturulurken hata oluştu!',
      error: error.message
    });
  }
});

// PUT update banner
router.put('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    res.json({
      success: true,
      message: 'Banner başarıyla güncellendi!',
      data: banner
    });
  } catch (error) {
    console.error('Banner güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner güncellenirken hata oluştu!',
      error: error.message
    });
  }
});

// DELETE banner (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { status: 'deleted' },
      { new: true }
    );
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    res.json({
      success: true,
      message: 'Banner başarıyla silindi!',
      data: banner
    });
  } catch (error) {
    console.error('Banner silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner silinirken hata oluştu!',
      error: error.message
    });
  }
});

// PUT update banner stats
router.put('/:id/stats', async (req, res) => {
  try {
    const { views, clicks, conversions, userId, deviceInfo, location } = req.body;
    const banner = await Banner.findById(req.params.id).populate('restaurant');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }

    // Banner stats'ı güncelle
    const updatedBanner = await Banner.findByIdAndUpdate(
      req.params.id,
      { 
        $inc: { 
          'stats.views': views || 0,
          'stats.clicks': clicks || 0,
          'stats.conversions': conversions || 0
        },
        updatedAt: new Date()
      },
      { new: true }
    );

    // BannerClick kayıtları oluştur
    try {
      if (views > 0) {
        await BannerClick.create({
          banner: banner._id,
          user: userId || null,
          restaurant: banner.restaurant?._id || null,
          action: 'view',
          deviceInfo: deviceInfo || {},
          location: location || {},
          timestamp: new Date()
        });
      }
      
      if (clicks > 0) {
        await BannerClick.create({
          banner: banner._id,
          user: userId || null,
          restaurant: banner.restaurant?._id || null,
          action: 'click',
          deviceInfo: deviceInfo || {},
          location: location || {},
          timestamp: new Date()
        });
      }
    } catch (clickError) {
      console.error('BannerClick kaydı oluşturulurken hata:', clickError);
      // BannerClick hatası banner stats güncellemesini engellemesin
    }
    
    res.json({
      success: true,
      message: 'Banner istatistikleri güncellendi!',
      data: updatedBanner
    });
  } catch (error) {
    console.error('Banner istatistikleri güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner istatistikleri güncellenirken hata oluştu!',
      error: error.message
    });
  }
});

// POST /nearby - Kullanıcı konumuna yakın kampanyaları bul (200m)
router.post('/nearby', async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude ve longitude gerekli!'
      });
    }

    console.log('🔍 Yakındaki kampanyalar aranıyor:', { 
      latitude, 
      longitude, 
      radius: radius || 100 
    });
    console.log('🆕 GÜNCEL KOD ÇALIŞIYOR - VERSION 2.0!');

    // Aktif ve onaylı kampanyaları al
    const banners = await Banner.find({
      approvalStatus: 'approved',
      'campaign.isActive': true
    }).populate('restaurant');

    // Yakındakileri filtrele
    const userLocation = { latitude, longitude };
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 GEOFENCING KONTROLÜ:');
    console.log('📍 Kullanıcı konumu:', userLocation);
    console.log('📏 Yarıçap:', radius || 100, 'metre');
    console.log('📦 Toplam aktif kampanya:', banners.length);
    
    const nearbyBanners = findNearbyBanners(userLocation, banners, radius || 100);
    
    console.log(`✅ ${nearbyBanners.length} yakın kampanya bulundu`);
    
    if (nearbyBanners.length > 0) {
      nearbyBanners.forEach(banner => {
        console.log(`  📍 ${banner.restaurant?.name || 'İsimsiz'} - ${banner.distanceText} uzaklıkta`);
        console.log(`     Koordinatlar: ${banner.bannerLocation?.coordinates?.latitude}, ${banner.bannerLocation?.coordinates?.longitude}`);
      });
    } else {
      console.log('⚠️ Yakında kampanya yok!');
      console.log('💡 İlk 3 kampanyanın koordinatları:');
      banners.slice(0, 3).forEach(b => {
        console.log(`  - ${b.restaurant?.name || 'İsimsiz'}:`);
        console.log(`    bannerLocation.coordinates:`, b.bannerLocation?.coordinates);
        console.log(`    restaurant.address.coordinates:`, b.restaurant?.address?.coordinates);
      });
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.json({
      success: true,
      count: nearbyBanners.length,
      data: nearbyBanners
    });
  } catch (error) {
    console.error('❌ Yakındaki kampanyalar aranırken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Yakındaki kampanyalar aranırken hata oluştu!',
      error: error.message
    });
  }
});

module.exports = router; 