const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');

// GET all restaurants
router.get('/', async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ isActive: true });
    res.json({
      success: true,
      data: restaurants
    });
  } catch (error) {
    console.error('Restoranlar listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoranlar listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// GET restaurant by ID
router.get('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }
    res.json({
      success: true,
      data: restaurant
    });
  } catch (error) {
    console.error('Restoran getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran getirilirken hata oluştu!',
      error: error.message
    });
  }
});

// POST new restaurant
router.post('/', async (req, res) => {
  try {
    const restaurant = new Restaurant(req.body);
    await restaurant.save();
    res.status(201).json({
      success: true,
      message: 'Restoran başarıyla oluşturuldu!',
      data: restaurant
    });
  } catch (error) {
    console.error('Restoran oluşturulurken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran oluşturulurken hata oluştu!',
      error: error.message
    });
  }
});

// PUT update restaurant
router.put('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }
    res.json({
      success: true,
      message: 'Restoran başarıyla güncellendi!',
      data: restaurant
    });
  } catch (error) {
    console.error('Restoran güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran güncellenirken hata oluştu!',
      error: error.message
    });
  }
});

// DELETE restaurant (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }
    res.json({
      success: true,
      message: 'Restoran başarıyla silindi!',
      data: restaurant
    });
  } catch (error) {
    console.error('Restoran silinirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran silinirken hata oluştu!',
      error: error.message
    });
  }
});

module.exports = router; 