const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadS3 = require('../middleware/uploadS3');
const User = require('../models/User');
const SMSService = require('../services/smsService');

// Multer yapılandırması - logo yükleme için
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/logos';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
    }
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Auth route çalışıyor!',
    timestamp: new Date().toISOString()
  });
});

// Twilio credentials test endpoint
router.get('/test-twilio', (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  res.json({
    message: 'Twilio credentials test',
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    hasPhoneNumber: !!phoneNumber,
    accountSidLength: accountSid ? accountSid.length : 0,
    authTokenLength: authToken ? authToken.length : 0,
    phoneNumber: phoneNumber || 'Not set'
  });
});

// Test endpoint - Push token'ları kontrol et
router.get('/check-push-tokens', async (req, res) => {
  try {
    const users = await User.find({});
    
    const userTokens = users.map(user => ({
      phone: user.phone,
      name: user.name,
      hasPushToken: !!user.expoPushToken,
      pushToken: user.expoPushToken ? user.expoPushToken.substring(0, 20) + '...' : 'Yok'
    }));
    
    res.json({
      success: true,
      totalUsers: users.length,
      usersWithTokens: userTokens.filter(u => u.hasPushToken).length,
      usersWithoutTokens: userTokens.filter(u => !u.hasPushToken).length,
      userTokens: userTokens
    });
    
  } catch (error) {
    console.error('Push token kontrol hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET;

// Basit kullanıcı kayıt (sadece telefon + şifre + isim)
router.post('/register', async (req, res) => {
  try {
    console.log('=== REGISTER İSTEĞİ ===');
    console.log('Body:', req.body);
    console.log('Headers:', req.headers);
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('=======================');
    
    const { phone, password, name, userType, category, city } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Telefon, şifre ve isim gerekli!'
      });
    }

    // Marka kayıtlarında kategori ve şehir zorunlu
    if ((userType === 'brand' || userType === 'eventBrand') && !category) {
      return res.status(400).json({
        success: false,
        message: 'Marka kayıtları için kategori seçimi zorunludur!'
      });
    }

    if ((userType === 'brand' || userType === 'eventBrand') && !city) {
      return res.status(400).json({
        success: false,
        message: 'Marka kayıtları için şehir seçimi zorunludur!'
      });
    }

    // Telefon numarası zaten kullanılıyor mu kontrol et
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu telefon numarası zaten kayıtlı!'
      });
    }

    // Yeni kullanıcı oluştur
    const user = new User({
      phone,
      password,
      name,
      userType: userType || 'customer',
      category: category || 'Kahve', // Kategori kayıt sırasında belirlenir
      city: city || null, // Şehir kayıt sırasında belirlenir
      restaurant: {
        name: name, // Restaurant adı marka adıyla aynı
        type: 'restaurant'
      }
    });

    await user.save();

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Kullanıcı başarıyla kaydedildi!',
      data: {
      user: {
          id: user._id,
          phone: user.phone,
          name: user.name,
          userType: user.userType,
          category: user.category,
          city: user.city,
          restaurant: user.restaurant,
          preferences: user.preferences || { city: null, categories: [] }
        },
        token
      }
    });

  } catch (error) {
    console.error('Kullanıcı kayıt hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı kaydedilirken hata oluştu!'
    });
  }
});

// Basit kullanıcı girişi (sadece telefon + şifre)
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Telefon ve şifre gerekli!'
      });
    }

    // Kullanıcıyı bul
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Telefon numarası veya şifre hatalı!'
      });
    }

    // Şifreyi kontrol et
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Telefon numarası veya şifre hatalı!'
      });
    }

    // Telefon doğrulaması kontrolü kaldırıldı - login için gerekli değil

    // JWT token oluştur
    const token = jwt.sign(
      { userId: user._id, phone: user.phone },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Giriş başarılı!',
      data: {
        user: {
          id: user._id,
          phone: user.phone,
          name: user.name,
          userType: user.userType,
          brandType: user.brandType,
          description: user.description,
          category: user.category,
          address: user.address,
          city: user.city,
          district: user.district,
          logo: user.logo,
          email: user.email,
          preferences: user.preferences || { city: null, categories: [] }
        },
        token
      }
    });

  } catch (error) {
    console.error('Kullanıcı giriş hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Giriş yapılırken hata oluştu!'
    });
  }
});

// Push token güncelleme (Expo ve OneSignal)
router.post('/update-push-token', async (req, res) => {
  try {
    const { phone, expoPushToken, oneSignalExternalId } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Telefon gerekli'
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Expo push token'ı güncelle
    if (expoPushToken) {
      user.expoPushToken = expoPushToken;
      console.log(`✅ Expo push token güncellendi: ${phone}`);
    }

    // OneSignal external ID'yi güncelle
    if (oneSignalExternalId) {
      user.oneSignalExternalId = oneSignalExternalId;
      console.log(`✅ OneSignal external ID güncellendi: ${phone} -> ${oneSignalExternalId}`);
    }

    await user.save();

    res.json({
      success: true,
      message: 'Push token güncellendi',
      data: {
        expoPushToken: user.expoPushToken,
        oneSignalExternalId: user.oneSignalExternalId
      }
    });

  } catch (error) {
    console.error('Push token güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Profil güncelleme endpoint'i (S3'e yükler)
router.put('/update-profile', uploadS3.single('logo'), async (req, res) => {
  try {
    console.log('=== PROFİL GÜNCELLEME İSTEĞİ ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    console.log('File:', req.file);

    // JWT token kontrolü
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token gerekli'
      });
    }

    // Token doğrulama
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // Kullanıcıyı bul
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Diskten silme yok; S3 kullanılıyor

    // Profil bilgilerini güncelle
    const updateData = {
      name: req.body.brandName || user.name,
      phone: req.body.phone || user.phone,
      email: req.body.email || user.email,
      brandType: req.body.brandType || user.brandType,
      description: req.body.description || user.description,
      // category kayıt sırasında belirlenir, güncellenmez
      // category: req.body.category || user.category, // DEVRE DIŞI
      address: req.body.address || user.address,
      city: req.body.city || user.city,
      district: req.body.district || user.district,
      updatedAt: new Date()
    };

    // Logo güncellenmişse ekle
    if (req.file) {
      const key = req.file.key || req.file.location || req.file.path;
      const base = process.env.CDN_BASE_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const url = req.file.location || `${base}/${key}`;
      updateData.logo = url;
    }

    // Kullanıcıyı güncelle
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    console.log('Profil güncellendi:', {
      userId: updatedUser._id,
      name: updatedUser.name,
      category: updatedUser.category,
      logo: updatedUser.logo
    });

    // Logo güncellendiyse, bu kullanıcının restaurant ve banner'larını güncelle
    if (updateData.logo || updateData.description || updateData.city || updateData.district) {
      try {
        const Banner = require('../models/Banner');
        const Restaurant = require('../models/Restaurant');
        
        // Önce kullanıcının restaurant'ını bul
        const restaurant = await Restaurant.findOne({ name: updatedUser.name });
        
        if (restaurant) {
          // Restaurant modelini güncelle
          const restaurantUpdateData = {};
          if (updateData.logo) restaurantUpdateData.logo = updateData.logo;
          if (updateData.description) restaurantUpdateData.description = updateData.description;
          if (updateData.city) restaurantUpdateData['address.city'] = updateData.city;
          if (updateData.district) restaurantUpdateData['address.district'] = updateData.district;
          
          await Restaurant.findByIdAndUpdate(
            restaurant._id,
            { $set: restaurantUpdateData },
            { new: true }
          );
          
          console.log('🏪 Restaurant güncellendi:', {
            restaurantId: restaurant._id,
            logo: updateData.logo
          });
          
          // Bu restoran'a ait tüm banner'ları güncelle
          const bannerUpdateData = {};
          if (updateData.logo) bannerUpdateData['brandProfile.logo'] = updateData.logo;
          if (updateData.description) bannerUpdateData['brandProfile.description'] = updateData.description;
          if (updateData.city) bannerUpdateData['brandProfile.city'] = updateData.city;
          if (updateData.district) bannerUpdateData['brandProfile.district'] = updateData.district;
          bannerUpdateData.updatedAt = new Date();
          
          const updateResult = await Banner.updateMany(
            { restaurant: restaurant._id },
            { $set: bannerUpdateData }
          );
          
          console.log('📢 Banner brandProfile güncellendi:', {
            matchedCount: updateResult.matchedCount,
            modifiedCount: updateResult.modifiedCount,
            updates: bannerUpdateData
          });
        }
      } catch (bannerUpdateError) {
        console.error('❌ Restaurant/Banner güncellenirken hata:', bannerUpdateError);
        // Hata olsa bile profil güncellemesi başarılı sayılır
      }
    }

    res.json({
      success: true,
      message: 'Profil başarıyla güncellendi',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        phone: updatedUser.phone,
        email: updatedUser.email,
        userType: updatedUser.userType,
        brandType: updatedUser.brandType,
        description: updatedUser.description,
        category: updatedUser.category,
        address: updatedUser.address,
        city: updatedUser.city,
        district: updatedUser.district,
        logo: updatedUser.logo
      }
    });

  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token'
      });
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Logo dosyası çok büyük (maksimum 5MB)'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// SMS Doğrulama Endpoint'leri

// Doğrulama kodu gönder
router.post('/send-verification-code', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası gerekli'
      });
    }

    const result = await SMSService.createVerificationCode(phone);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        code: result.code // Test için (production'da kaldırılmalı)
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('SMS doğrulama kodu gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Doğrulama kodunu kontrol et
router.post('/verify-code', async (req, res) => {
  try {
    console.log('=== VERIFY CODE İSTEĞİ ===');
    console.log('Body:', req.body);
    console.log('Headers:', req.headers);
    console.log('URL:', req.url);
    console.log('Method:', req.method);
    console.log('=======================');
    
    const { phone, code } = req.body;

    if (!phone || !code) {
      console.log('❌ Eksik parametreler - phone:', phone, 'code:', code);
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası ve kod gerekli'
      });
    }

    const result = await SMSService.verifyCode(phone, code);
    
    if (result.success) {
      // Kullanıcının telefon doğrulamasını güncelle
      await User.findOneAndUpdate(
        { phone },
        { phoneVerified: true }
      );
      
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        attemptsLeft: result.attemptsLeft
      });
    }
  } catch (error) {
    console.error('SMS doğrulama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Mevcut kullanıcıların phoneVerified durumunu güncelle (test için)
router.post('/update-phone-verified', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası gerekli'
      });
    }

    const user = await User.findOneAndUpdate(
      { phone },
      { phoneVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    res.json({
      success: true,
      message: 'Kullanıcı güncellendi',
      user: {
        phone: user.phone,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (error) {
    console.error('Kullanıcı güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// 6 haneli kod oluştur (günde bir kez)
router.post('/generate-code', async (req, res) => {
  try {
    // Debug logları kaldırıldı - güvenlik için
    
    const { phone, bannerId } = req.body;
    
    if (!phone || !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası ve banner ID gerekli'
      });
    }

    // Kullanıcı giriş yapmış mı kontrol et
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Kod oluşturmak için giriş yapmalısınız',
        needsLogin: true
      });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Kullanıcı bulunamadı'
        });
      }

      // Banner'ı bul ve kod tipini kontrol et
      const Banner = require('../models/Banner');
      const banner = await Banner.findById(bannerId);
      
      if (!banner) {
        return res.status(404).json({
          success: false,
          message: 'Banner bulunamadı'
        });
      }

      // Bu banner için bugün kod var mı kontrol et
      const CodeHistory = require('../models/CodeHistory');
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Bugünün başlangıcı
      
      const existingCode = await CodeHistory.findOne({
        userId: user._id,
        bannerId: bannerId,
        createdAt: { $gte: today }
      });

      if (existingCode) {
        return res.json({
          success: true,
          message: 'Bu banner için bugün kod zaten oluşturulmuş',
          code: existingCode.code,
          createdAt: existingCode.createdAt,
          expiresIn: '24 saat',
          isReused: true,
          codeType: banner.codeSettings?.codeType || 'random'
        });
      }

      // Kod oluştur - Sabit veya Random
      let code;
      if (banner.codeSettings?.codeType === 'fixed' && banner.codeSettings?.fixedCode) {
        // Sabit kod kullan
        code = banner.codeSettings.fixedCode;
        console.log('🔒 Sabit kod kullanılıyor:', code);
      } else {
        // Random kod oluştur
        code = Math.floor(100000 + Math.random() * 900000).toString();
        console.log('🎲 Random kod oluşturuldu:', code);
      }
      
      // Veritabanına kaydet
      const codeHistory = new CodeHistory({
        userId: user._id,
        phone: user.phone,
        bannerId: bannerId,
        code: code
      });
      
      await codeHistory.save();
      
      res.json({
        success: true,
        message: 'Kod oluşturuldu',
        code: code,
        createdAt: codeHistory.createdAt,
        expiresIn: '24 saat',
        isReused: false,
        codeType: banner.codeSettings?.codeType || 'random'
      });
      
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token'
      });
    }
    
  } catch (error) {
    console.error('Kod oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Marka profilinden logo çekme endpoint'i
router.get('/brand-logo/:restaurantName', async (req, res) => {
  try {
    const { restaurantName } = req.params;
    
    console.log('🔍 Marka logo çekiliyor:', restaurantName);
    
    // Önce User modelinde restaurant.name ile ara
    const user = await User.findOne({ 
      'restaurant.name': { $regex: new RegExp(restaurantName, 'i') }
    });
    
    console.log('🔍 User arama sonucu:', {
      restaurantName,
      userFound: !!user,
      userId: user?._id,
      userName: user?.name,
      userLogo: user?.logo,
      restaurantName: user?.restaurant?.name
    });
    
    if (user && user.logo) {
      console.log('✅ User modelinde logo bulundu:', user.logo);
      return res.json({
        success: true,
        logo: user.logo,
        brandName: user.name || user.restaurant?.name,
        source: 'user'
      });
    }
    
    // User'da bulunamazsa Restaurant modelinde ara
    const Restaurant = require('../models/Restaurant');
    const restaurant = await Restaurant.findOne({ 
      name: { $regex: new RegExp(restaurantName, 'i') }
    });
    
    if (restaurant && restaurant.logo) {
      console.log('✅ Restaurant modelinde logo bulundu:', restaurant.logo);
      return res.json({
        success: true,
        logo: restaurant.logo,
        brandName: restaurant.name,
        source: 'restaurant'
      });
    }
    
    console.log('❌ Logo bulunamadı:', restaurantName);
    res.json({
      success: false,
      message: 'Logo bulunamadı'
    });
    
  } catch (error) {
    console.error('Marka logo çekme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Kullanıcının kampanya geçmişini getir (kod oluşturduğu banner'lar)
router.get('/my-campaigns/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası gerekli'
      });
    }

    const CodeHistory = require('../models/CodeHistory');
    const Banner = require('../models/Banner');
    
    // Kullanıcının tüm kod geçmişini çek (son 30 gün)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const codeHistory = await CodeHistory.find({
      phone: phone,
      createdAt: { $gte: thirtyDaysAgo }
    })
    .populate('bannerId')
    .sort({ createdAt: -1 }); // En yeni önce
    
    // Banner bilgilerini formatla
    const campaigns = await Promise.all(codeHistory.map(async (history) => {
      const banner = history.bannerId;
      
      if (!banner) {
        return null; // Banner silinmişse
      }
      
      // Banner'ı populate et
      await banner.populate('restaurant');
      
      return {
        _id: banner._id,
        title: banner.title,
        description: banner.description,
        category: banner.category,
        code: history.code,
        createdAt: history.createdAt,
        used: history.used,
        usedAt: history.usedAt,
        campaign: banner.campaign,
        bannerLocation: banner.bannerLocation,
        brandProfile: banner.brandProfile,
        restaurant: banner.restaurant,
        status: banner.status
      };
    }));
    
    // Null değerleri filtrele (silinmiş banner'lar)
    const validCampaigns = campaigns.filter(c => c !== null);
    
    console.log('✅ Kampanya geçmişi alındı:', {
      phone,
      totalCampaigns: validCampaigns.length
    });
    
    res.json({
      success: true,
      campaigns: validCampaigns
    });
    
  } catch (error) {
    console.error('Kampanya geçmişi alma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Kullanıcı tercihlerini güncelleme (şehir ve kategoriler)
router.put('/update-preferences', async (req, res) => {
  try {
    const { phone, city, categories } = req.body;
    
    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Telefon numarası gerekli'
      });
    }
    
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }
    
    // Tercihleri güncelle
    user.preferences = {
      city: city || user.preferences?.city,
      categories: categories || user.preferences?.categories || []
    };
    
    await user.save();
    
    console.log('✅ Kullanıcı tercihleri güncellendi:', {
      phone,
      city,
      categories,
      savedPreferences: user.preferences
    });
    
    res.json({
      success: true,
      message: 'Tercihler güncellendi',
      data: {
        preferences: {
          city: user.preferences.city,
          categories: user.preferences.categories
        }
      }
    });
    
  } catch (error) {
    console.error('Tercih güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

module.exports = router; 