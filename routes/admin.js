const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Banner = require('../models/Banner');
const OneSignalService = require('../services/oneSignalService');

// Admin middleware
const adminAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme token\'ı gerekli!'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için admin yetkisi gereklidir!'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin auth hatası:', error);
    res.status(401).json({
      success: false,
      message: 'Geçersiz token!'
    });
  }
};

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Telefon ve şifre gerekli!'
      });
    }

    // Admin kullanıcısını bul
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz telefon veya şifre!'
      });
    }

    // Şifreyi kontrol et
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz telefon veya şifre!'
      });
    }

    // Admin kontrolü
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Bu hesap admin değil!'
      });
    }

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user._id, phone: user.phone, isAdmin: true },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Admin giriş başarılı:', user.phone);

    res.json({
      success: true,
      message: 'Admin girişi başarılı',
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        userType: 'admin',
        isAdmin: true
      }
    });
  } catch (error) {
    console.error('Admin login hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Giriş yapılırken hata oluştu!'
    });
  }
});

// Bekleyen banner'ları listele
router.get('/banners/pending', adminAuth, async (req, res) => {
  try {
    const pendingBanners = await Banner.find({ 
      approvalStatus: 'pending' 
    })
    .populate('restaurant')
    .sort({ createdAt: -1 }); // En yeni önce

    console.log(`📋 ${pendingBanners.length} adet bekleyen banner bulundu`);

    res.json({
      success: true,
      data: pendingBanners,
      count: pendingBanners.length
    });
  } catch (error) {
    console.error('Pending banners listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!'
    });
  }
});

// Banner'ı onayla
router.post('/banners/:id/approve', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const banner = await Banner.findById(id).populate('restaurant');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }

    if (banner.approvalStatus === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Bu banner zaten onaylanmış!'
      });
    }

    // Banner'ı onayla
    banner.approvalStatus = 'approved';
    banner.approvedBy = req.user._id;
    banner.approvedAt = new Date();
    await banner.save();

    console.log('✅ Banner onaylandı:', {
      bannerId: banner._id,
      title: banner.title,
      approvedBy: req.user.name
    });

    // Onaylandıktan sonra bildirim gönder
    try {
      console.log('📱 Onaylanan banner için bildirim gönderiliyor...');
      const bannerCity = banner.bannerLocation?.city || null;
      const bannerCategory = banner.category || null;
      
      // contentType'a göre bildirim başlığını belirle
      const notificationTitle = banner.contentType === 'event' ? '🎪 Yeni Etkinlik!' : '🎉 Yeni Kampanya!';
      
      const oneSignalResult = await OneSignalService.sendToAll(
        notificationTitle,
        `${banner.restaurant.name} - ${banner.description}`,
        { 
          type: banner.contentType === 'event' ? 'new_event' : 'new_banner',
          bannerId: banner._id.toString(),
          restaurantName: banner.restaurant.name,
          contentType: banner.contentType,
          timestamp: new Date().toISOString()
        },
        bannerCity,  // Şehir filtresi
        bannerCategory  // Kategori filtresi
      );
      console.log('✅ OneSignal push notification gönderildi:', oneSignalResult);
    } catch (oneSignalError) {
      console.error('❌ OneSignal push notification gönderilemedi:', oneSignalError);
    }

    res.json({
      success: true,
      message: 'Banner başarıyla onaylandı ve kullanıcılara bildirim gönderildi!',
      data: banner
    });
  } catch (error) {
    console.error('Banner onaylama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner onaylanırken hata oluştu!'
    });
  }
});

// Banner'ı reddet
router.post('/banners/:id/reject', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const banner = await Banner.findById(id).populate('restaurant');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }

    if (banner.approvalStatus === 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Bu banner zaten reddedilmiş!'
      });
    }

    // Banner'ı reddet
    banner.approvalStatus = 'rejected';
    banner.rejectedReason = reason || 'Belirtilmedi';
    banner.approvedBy = req.user._id;
    banner.approvedAt = new Date();
    await banner.save();

    console.log('❌ Banner reddedildi:', {
      bannerId: banner._id,
      title: banner.title,
      rejectedBy: req.user.name,
      reason: reason
    });

    res.json({
      success: true,
      message: 'Banner reddedildi!',
      data: banner
    });
  } catch (error) {
    console.error('Banner reddetme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner reddedilirken hata oluştu!'
    });
  }
});

// Onaylanmış banner'ları listele
router.get('/banners/approved', adminAuth, async (req, res) => {
  try {
    const approvedBanners = await Banner.find({ 
      approvalStatus: 'approved' 
    })
    .populate('restaurant')
    .populate('approvedBy', 'name phone')
    .sort({ approvedAt: -1 }); // En yeni önce

    console.log(`✅ ${approvedBanners.length} adet onaylanmış banner bulundu`);

    res.json({
      success: true,
      data: approvedBanners,
      count: approvedBanners.length
    });
  } catch (error) {
    console.error('Approved banners listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!'
    });
  }
});

// Reddedilmiş banner'ları listele
router.get('/banners/rejected', adminAuth, async (req, res) => {
  try {
    const rejectedBanners = await Banner.find({ 
      approvalStatus: 'rejected' 
    })
    .populate('restaurant')
    .populate('approvedBy', 'name phone')
    .sort({ approvedAt: -1 }); // En yeni önce

    console.log(`❌ ${rejectedBanners.length} adet reddedilmiş banner bulundu`);

    res.json({
      success: true,
      data: rejectedBanners,
      count: rejectedBanners.length
    });
  } catch (error) {
    console.error('Rejected banners listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!'
    });
  }
});

// Tüm banner'ları listele (admin için)
router.get('/banners', adminAuth, async (req, res) => {
  try {
    const { status, contentType } = req.query;
    
    let query = {};
    if (status) {
      query.approvalStatus = status;
    }
    if (contentType) {
      query.contentType = contentType;
    }

    const banners = await Banner.find(query)
      .populate('restaurant')
      .populate('approvedBy', 'name phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: banners,
      count: banners.length
    });
  } catch (error) {
    console.error('Banners listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!'
    });
  }
});

// İstatistikler
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const pendingCount = await Banner.countDocuments({ approvalStatus: 'pending' });
    const approvedCount = await Banner.countDocuments({ approvalStatus: 'approved' });
    const rejectedCount = await Banner.countDocuments({ approvalStatus: 'rejected' });
    const totalBrands = await User.countDocuments({ 
      $or: [{ userType: 'brand' }, { userType: 'eventBrand' }] 
    });
    const totalCustomers = await User.countDocuments({ userType: 'customer' });

    res.json({
      success: true,
      data: {
        banners: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          total: pendingCount + approvedCount + rejectedCount
        },
        users: {
          brands: totalBrands,
          customers: totalCustomers,
          total: totalBrands + totalCustomers
        }
      }
    });
  } catch (error) {
    console.error('İstatistik alma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınırken hata oluştu!'
    });
  }
});

console.log('🔧 Admin Routes kayıtlı:');
console.log('  - POST /admin/login');
console.log('  - GET /admin/banners/pending');
console.log('  - POST /admin/banners/:id/approve');
console.log('  - POST /admin/banners/:id/reject');
console.log('  - GET /admin/banners/approved');
console.log('  - GET /admin/banners/rejected');
console.log('  - GET /admin/banners');
console.log('  - GET /admin/stats');

module.exports = router;

