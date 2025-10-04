const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    
    const { phone, password, name, userType } = req.body;

    if (!phone || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Telefon, şifre ve isim gerekli!'
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
      userType: userType || 'customer'
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
          userType: user.userType
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
          userType: user.userType
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

// Push token güncelleme
router.post('/update-push-token', async (req, res) => {
  try {
    const { phone, expoPushToken } = req.body;
    
    if (!phone || !expoPushToken) {
      return res.status(400).json({
        success: false,
        message: 'Telefon ve push token gerekli'
      });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    user.expoPushToken = expoPushToken;
    await user.save();

    console.log(`Push token güncellendi: ${phone}`);

    res.json({
      success: true,
      message: 'Push token güncellendi'
    });

  } catch (error) {
    console.error('Push token güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sunucu hatası'
    });
  }
});

// Profil güncelleme endpoint'i
router.put('/update-profile', upload.single('logo'), async (req, res) => {
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

    // Eski logo dosyasını sil (varsa)
    if (user.logo && req.file) {
      const oldLogoPath = path.join('uploads/logos', user.logo);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    // Profil bilgilerini güncelle
    const updateData = {
      name: req.body.brandName || user.name,
      phone: req.body.phone || user.phone,
      email: req.body.email || user.email,
      brandType: req.body.brandType || user.brandType,
      description: req.body.description || user.description,
      category: req.body.category || user.category,
      address: req.body.address || user.address,
      city: req.body.city || user.city,
      district: req.body.district || user.district,
      updatedAt: new Date()
    };

    // Logo güncellenmişse ekle
    if (req.file) {
      updateData.logo = req.file.filename;
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
          isReused: true
        });
      }

      // 6 haneli kod oluştur
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
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
        isReused: false
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

module.exports = router; 