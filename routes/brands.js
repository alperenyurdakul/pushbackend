const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * GET /api/brands
 * Tüm markaları getir (kategoriye göre filtreleme ile)
 */
router.get('/', async (req, res) => {
  try {
    const { category, city, district } = req.query;
    
    // Sadece brand ve eventBrand kullanıcılarını getir
    const query = {
      userType: { $in: ['brand', 'eventBrand'] }
    };
    
    // Kategori filtresi
    if (category) {
      query.category = category;
    }
    
    // Şehir filtresi
    if (city) {
      query.city = city;
    }
    
    // İlçe filtresi
    if (district) {
      query.district = district;
    }
    
    const brands = await User.find(query)
      .select('name logo description category city district address phone email openingHours features latitude longitude brandType')
      .sort({ name: 1 })
      .lean();
    
    // Banner'ları getir ve markalara ekle
    const Banner = require('../models/Banner');
    const RestaurantReview = require('../models/RestaurantReview');
    
    const brandsWithRating = await Promise.all(brands.map(async (brand) => {
      // Yorumları getir ve puan hesapla
      const reviews = await RestaurantReview.find({
        restaurant: brand._id
      }).lean();
      
      const ratings = reviews.map(r => r.rating).filter(Boolean);
      const averageRating = ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : 0;
      
      // Banner'ları getir
      const banners = await Banner.find({
        restaurant: brand._id,
        status: 'active',
        approvalStatus: 'approved'
      })
        .select('title description bannerImage category campaign createdAt')
        .sort({ createdAt: -1 })
        .lean();
      
      return {
        ...brand,
        rating: averageRating,
        reviewCount: reviews.length,
        banners: banners || []
      };
    }));
    
    res.json({
      success: true,
      data: brandsWithRating
    });
  } catch (error) {
    console.error('Markalar getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Markalar getirilemedi',
      error: error.message
    });
  }
});

/**
 * GET /api/brands/categories
 * Tüm kategorileri getir
 */
router.get('/categories', async (req, res) => {
  try {
    const brands = await User.find({
      userType: { $in: ['brand', 'eventBrand'] },
      category: { $exists: true, $ne: null }
    })
      .select('category')
      .lean();
    
    // Unique kategorileri çıkar
    const categories = [...new Set(brands.map(b => b.category).filter(Boolean))];
    
    res.json({
      success: true,
      data: categories.sort()
    });
  } catch (error) {
    console.error('Kategoriler getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler getirilemedi',
      error: error.message
    });
  }
});

/**
 * GET /api/brands/:id
 * Marka detayını getir
 */
router.get('/:id', async (req, res) => {
  try {
    const brand = await User.findById(req.params.id)
      .select('name logo bannerImage description category city district address phone email openingHours features latitude longitude brandType menuImages menuImage menuLink createdAt')
      .lean();
    
    if (!brand) {
      return res.status(404).json({
        success: false,
        message: 'Marka bulunamadı'
      });
    }
    
    // Banner'ları getir (aktif olanlar)
    const Banner = require('../models/Banner');
    const banners = await Banner.find({
      restaurant: brand._id,
      status: 'active',
      approvalStatus: 'approved'
    })
      .select('title description bannerImage category validUntil stats')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    // Yorumları getir (RestaurantReview'dan)
    const RestaurantReview = require('../models/RestaurantReview');
    const reviews = await RestaurantReview.find({
      restaurant: brand._id
    })
      .populate('user', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Puan hesapla
    const ratings = reviews.map(r => r.rating).filter(Boolean);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;
    
    res.json({
      success: true,
      data: {
        ...brand,
        rating: averageRating,
        reviewCount: reviews.length,
        banners: banners,
        reviews: reviews
      }
    });
  } catch (error) {
    console.error('Marka detay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Marka detayı getirilemedi',
      error: error.message
    });
  }
});

/**
 * POST /api/brands/:id/reviews
 * Marka için yorum ekle
 */
router.post('/:id/reviews', async (req, res) => {
  try {
    const { userId, userPhone, userName, rating, comment } = req.body;
    const brandId = req.params.id;

    // Check if brand exists
    const brand = await User.findById(brandId);
    if (!brand || (brand.userType !== 'brand' && brand.userType !== 'eventBrand')) {
      return res.status(404).json({
        success: false,
        message: 'Marka bulunamadı!'
      });
    }

    // RestaurantReview modelinde restaurant field'ı brand._id'yi kullanıyor
    const RestaurantReview = require('../models/RestaurantReview');
    
    // Create review
    const review = new RestaurantReview({
      restaurant: brandId, // Brand ID'yi restaurant olarak kullan
      user: userId,
      userPhone,
      userName,
      rating,
      comment,
      status: 'approved'
    });

    await review.save();

    // Update brand's average rating (reviews'ları yeniden hesapla)
    const allReviews = await RestaurantReview.find({ 
      restaurant: brandId,
      status: 'approved'
    });
    
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = allReviews.length > 0 ? totalRating / allReviews.length : 0;
    
    // Brand için rating bilgisini güncelle (User modelinde rating field'ı yoksa eklenebilir)
    // Şimdilik sadece review'ı döndürüyoruz

    // Review'ı populate et
    await review.populate('user', 'name profilePhoto');

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

