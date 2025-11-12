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


module.exports = router;