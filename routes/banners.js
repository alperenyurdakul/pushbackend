const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
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

// POST new banner
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
    const { views, clicks, conversions } = req.body;
    const banner = await Banner.findByIdAndUpdate(
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
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    
    res.json({
      success: true,
      message: 'Banner istatistikleri güncellendi!',
      data: banner
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
      radius: radius || 200 
    });

    // Aktif ve onaylı kampanyaları al
    const banners = await Banner.find({
      approvalStatus: 'approved',
      isActive: true
    }).populate('restaurant');

    // Yakındakileri filtrele
    const userLocation = { latitude, longitude };
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 GEOFENCING KONTROLÜ:');
    console.log('📍 Kullanıcı konumu:', userLocation);
    console.log('📏 Yarıçap:', radius || 700, 'metre');
    console.log('📦 Toplam aktif kampanya:', banners.length);
    
    const nearbyBanners = findNearbyBanners(userLocation, banners, radius || 700);
    
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