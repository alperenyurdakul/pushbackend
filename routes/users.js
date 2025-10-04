const express = require('express');
const router = express.Router();
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