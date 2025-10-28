const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');
const RestaurantReview = require('../models/RestaurantReview');
const Banner = require('../models/Banner');

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

// GET restaurant by ID with reviews and active banners
router.get('/detail/:id', async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    // Get reviews with user details
    const reviews = await RestaurantReview.find({ 
      restaurant: req.params.id,
      status: 'approved'
    })
      .populate('user', 'name phone')
      .sort({ createdAt: -1 })
      .limit(50);

    // Get active banners for this restaurant
    const banners = await Banner.find({
      restaurant: req.params.id,
      status: 'active',
      approvalStatus: 'approved'
    })
      .populate('restaurant', 'name logo')
      .sort({ createdAt: -1 });

    // Calculate average rating
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    res.json({
      success: true,
      data: {
        restaurant,
        reviews,
        reviewsCount: reviews.length,
        averageRating: averageRating.toFixed(1),
        activeBanners: banners
      }
    });
  } catch (error) {
    console.error('Restoran detay getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Restoran detay getirilirken hata oluştu!',
      error: error.message
    });
  }
});

// GET reviews for a restaurant
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await RestaurantReview.find({ 
      restaurant: req.params.id,
      status: 'approved'
    })
      .populate('user', 'name phone')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Yorumlar getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Yorumlar getirilirken hata oluştu!',
      error: error.message
    });
  }
});

// POST review for a restaurant
router.post('/:id/reviews', async (req, res) => {
  try {
    const { userId, userPhone, userName, rating, comment } = req.body;
    const restaurantId = req.params.id;

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    // Create review
    const review = new RestaurantReview({
      restaurant: restaurantId,
      user: userId,
      userPhone,
      userName,
      rating,
      comment,
      status: 'approved'
    });

    await review.save();

    // Update restaurant's average rating
    const allReviews = await RestaurantReview.find({ 
      restaurant: restaurantId,
      status: 'approved'
    });
    
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = allReviews.length > 0 ? totalRating / allReviews.length : 0;
    
    await Restaurant.findByIdAndUpdate(restaurantId, {
      averageRating,
      totalReviews: allReviews.length
    });

    res.status(201).json({
      success: true,
      message: 'Yorum başarıyla eklendi!',
      data: review
    });
  } catch (error) {
    console.error('Yorum eklenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Yorum eklenirken hata oluştu!',
      error: error.message
    });
  }
});

module.exports = router; 