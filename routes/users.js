const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const uploadS3 = require('../middleware/uploadS3');
const { uploadProfilePhoto } = require('../middleware/uploadS3');
const User = require('../models/User');

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Users route çalışıyor!' });
});


// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password');
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    // Eski kullanıcılar için statistics varsa null veya undefined olabilir, default değerleri ata
    if (!user.statistics) {
      user.statistics = {
        attendedEventsCount: 0,
        usedCampaignsCount: 0,
        totalSavings: 0
      };
      await user.save();
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Update user profile
router.put('/:id/profile', uploadProfilePhoto.single('profilePhoto'), async (req, res) => {
  try {
    console.log('📝 Profil güncelleme isteği alındı:', {
      userId: req.params.id,
      body: req.body,
      hasFile: !!req.file,
      fileInfo: req.file ? {
        fieldname: req.file.fieldname,
        originalname: req.file.originalname,
        size: req.file.size,
        location: req.file.location,
        key: req.file.key
      } : 'Yok'
    });
    
    const { age, instagram } = req.body;
    
    // ObjectId doğrulama
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('❌ Geçersiz ObjectId:', req.params.id);
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID!' });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      console.error('❌ Kullanıcı bulunamadı:', req.params.id);
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı!' });
    }

    console.log('👤 Kullanıcı bulundu:', {
      id: user._id,
      name: user.name,
      phone: user.phone,
      currentAge: user.age,
      currentInstagram: user.instagram,
      currentProfilePhoto: user.profilePhoto
    });

    // Update user fields
    if (age) {
      user.age = parseInt(age);
      console.log('✅ Yaş güncellendi:', age);
    }
    if (instagram) {
      user.instagram = instagram;
      console.log('✅ Instagram güncellendi:', instagram);
    }
    
    // Profile photo güncellenmişse ekle
    if (req.file) {
      const key = req.file.key || req.file.location || req.file.path;
      const base = process.env.CDN_BASE_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const url = req.file.location || `${base}/${key}`;
      user.profilePhoto = url;
      console.log('✅ Profil fotoğrafı güncellendi:', url);
    }
    
    await user.save();
    console.log('💾 Kullanıcı kaydedildi');
    
    res.json({ 
      success: true,
      message: 'Profil güncellendi!', 
      user: user 
    });
  } catch (error) {
    console.error('❌ Profil güncelleme hatası:', error);
    console.error('❌ Hata detayları:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.id,
      body: req.body,
      hasFile: !!req.file
    });
    res.status(500).json({ 
      success: false, 
      message: 'Sunucu hatası!',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { name, email, brandType, description, category, address, city, district } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    // Update user fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (brandType) user.brandType = brandType;
    if (description) user.description = description;
    if (category) user.category = category;
    if (address) user.address = address;
    if (city) user.city = city;
    if (district) user.district = district;
    
    await user.save();
    
    res.json({ message: 'Kullanıcı güncellendi!', user: user });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }
    
    res.json({ message: 'Kullanıcı silindi!' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// POST /push-token - FCM/APNs push token kayıt
router.post('/push-token', async (req, res) => {
  try {
    const { userId, phone, pushToken, platform, type } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        message: 'Push token gerekli!'
      });
    }

    // Kullanıcıyı bul (userId veya phone ile)
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (phone) {
      user = await User.findOne({ phone });
    } else {
      return res.status(400).json({
        success: false,
        message: 'userId veya phone gerekli!'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Expo Push Token kontrolü (direkt FCM/APNs ile gönderilemez!)
    const isExpoToken = req.body.isExpoToken || pushToken.startsWith('ExponentPushToken[');
    
    if (isExpoToken || pushToken.startsWith('ExponentPushToken[')) {
      console.log(`⚠️ UYARI: Expo Push Token kaydedildi: ${user.name}`);
      console.log(`   Token: ${pushToken.substring(0, 30)}...`);
      console.log(`   ⚠️ Bu token direkt FCM/APNs ile gönderilemez!`);
      console.log(`   ⚠️ Expo Push Notification service kullanılmalı!`);
      console.log(`   💡 Kullanıcının uygulamadan yeniden login olması ve native token alması gerekiyor!`);
    } else {
      console.log(`✅ Native push token kaydedildi: ${user.name} (${platform})`);
      console.log(`   Token: ${pushToken.substring(0, 20)}...`);
      console.log(`   ✅ Bu token direkt FCM/APNs ile gönderilebilir!`);
    }

    // Token'ı güncelle
    user.pushToken = pushToken;
    user.pushPlatform = platform || null;
    user.pushTokenType = type || null;
    user.updatedAt = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Push token kaydedildi!',
      data: {
        userId: user._id,
        pushToken: pushToken.substring(0, 20) + '...', // Güvenlik için kısaltılmış
        platform,
        type
      }
    });
  } catch (error) {
    console.error('❌ Push token kayıt hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Push token kaydedilirken hata oluştu!',
      error: error.message
    });
  }
});


module.exports = router;