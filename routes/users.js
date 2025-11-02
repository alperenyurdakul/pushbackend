const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası!' });
  }
});

// Update user profile
router.put('/:id/profile', uploadProfilePhoto.single('profilePhoto'), async (req, res) => {
  try {
    const { age, instagram } = req.body;
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı!' });
    }

    // Update user fields
    if (age) user.age = parseInt(age);
    if (instagram) user.instagram = instagram;
    
    // Profile photo güncellenmişse ekle
    if (req.file) {
      const key = req.file.key || req.file.location || req.file.path;
      const base = process.env.CDN_BASE_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
      const url = req.file.location || `${base}/${key}`;
      user.profilePhoto = url;
    }
    
    await user.save();
    
    res.json({ 
      success: true,
      message: 'Profil güncellendi!', 
      user: user 
    });
  } catch (error) {
    console.error('Profil güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası!' });
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