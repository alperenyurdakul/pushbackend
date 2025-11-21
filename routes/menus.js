const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');
const User = require('../models/User');
const { scrapeMenu, detectPriceChanges } = require('../services/menuScrapingService');

// Middleware - Auth kontrolü
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token gerekli' });
    }

    // JWT decode (basit kontrol - gerçek projede jwt.verify kullanın)
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Geçersiz token' });
  }
};

/**
 * GET /api/menus/my-menu
 * Kullanıcının menüsünü getir
 */
router.get('/my-menu', authenticate, async (req, res) => {
  try {
    const menu = await Menu.findOne({ restaurant: req.user._id })
      .sort({ updatedAt: -1 });

    if (!menu) {
      return res.json({ 
        success: true, 
        data: null,
        message: 'Menü bulunamadı'
      });
    }

    res.json({ 
      success: true, 
      data: menu 
    });
  } catch (error) {
    console.error('Menü getirme hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Menü getirilemedi',
      error: error.message 
    });
  }
});

/**
 * POST /api/menus/save-menu-url
 * Menü URL'sini kaydet (ilk kayıt)
 */
router.post('/save-menu-url', authenticate, async (req, res) => {
  try {
    const { menuUrl } = req.body;

    if (!menuUrl || !menuUrl.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Menü URL gerekli' 
      });
    }

    // URL formatını kontrol et
    try {
      new URL(menuUrl);
    } catch {
      return res.status(400).json({ 
        success: false, 
        message: 'Geçersiz URL formatı' 
      });
    }

    // Mevcut menüyü kontrol et
    let menu = await Menu.findOne({ restaurant: req.user._id });

    if (menu) {
      // Güncelle
      menu.menuUrl = menuUrl;
      menu.scrapingStatus = 'pending';
      await menu.save();
    } else {
      // Yeni oluştur
      menu = new Menu({
        restaurant: req.user._id,
        menuUrl: menuUrl,
        scrapingStatus: 'pending'
      });
      await menu.save();
    }

    res.json({ 
      success: true, 
      message: 'Menü URL kaydedildi',
      data: menu 
    });
  } catch (error) {
    console.error('Menü URL kaydetme hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Menü URL kaydedilemedi',
      error: error.message 
    });
  }
});

/**
 * POST /api/menus/scrape
 * Menüyü scrape et ve fiyatları güncelle
 */
router.post('/scrape', authenticate, async (req, res) => {
  try {
    const menu = await Menu.findOne({ restaurant: req.user._id });

    if (!menu || !menu.menuUrl) {
      return res.status(400).json({ 
        success: false, 
        message: 'Menü URL bulunamadı. Önce menü URL\'sini kaydedin.' 
      });
    }

    // Scraping durumunu güncelle
    menu.scrapingStatus = 'processing';
    await menu.save();

    // Scraping işlemini başlat (async - kullanıcıya hemen cevap ver)
    scrapeMenu(menu.menuUrl)
      .then(async (result) => {
        if (result.success && result.items.length > 0) {
          // Eski item'ları sakla (fiyat değişikliği için)
          const oldItems = menu.items || [];

          // Yeni item'ları kaydet
          menu.items = result.items;
          menu.lastScrapedAt = new Date();
          menu.scrapingStatus = 'success';
          menu.scrapingError = null;

          // Fiyat değişikliklerini tespit et
          if (oldItems.length > 0) {
            const priceChanges = detectPriceChanges(oldItems, result.items);
            if (priceChanges.length > 0) {
              menu.priceHistory.push({
                date: new Date(),
                totalItems: result.items.length,
                averagePrice: result.averagePrice,
                priceChanges: priceChanges
              });
            }
          }

          await menu.save();
          console.log(`✅ Menü scraping tamamlandı: ${result.items.length} ürün`);
        } else {
          menu.scrapingStatus = 'failed';
          menu.scrapingError = result.error || 'Scraping başarısız';
          await menu.save();
          console.error(`❌ Menü scraping başarısız: ${result.error}`);
        }
      })
      .catch(async (error) => {
        menu.scrapingStatus = 'failed';
        menu.scrapingError = error.message;
        await menu.save();
        console.error('❌ Scraping hatası:', error);
      });

    // Kullanıcıya hemen cevap ver (işlem arka planda devam eder)
    res.json({ 
      success: true, 
      message: 'Menü scraping başlatıldı. Birkaç saniye içinde tamamlanacak.',
      data: {
        status: 'processing',
        menuId: menu._id
      }
    });
  } catch (error) {
    console.error('Scraping başlatma hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Scraping başlatılamadı',
      error: error.message 
    });
  }
});

/**
 * GET /api/menus/scrape-status
 * Scraping durumunu kontrol et
 */
router.get('/scrape-status', authenticate, async (req, res) => {
  try {
    const menu = await Menu.findOne({ restaurant: req.user._id });

    if (!menu) {
      return res.json({ 
        success: true, 
        data: { 
          status: 'no-menu',
          message: 'Menü bulunamadı' 
        } 
      });
    }

    res.json({ 
      success: true, 
      data: {
        status: menu.scrapingStatus,
        lastScrapedAt: menu.lastScrapedAt,
        error: menu.scrapingError,
        totalItems: menu.items?.length || 0,
        menu: menu.scrapingStatus === 'success' ? menu : null
      }
    });
  } catch (error) {
    console.error('Scraping durumu kontrol hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Durum kontrol edilemedi',
      error: error.message 
    });
  }
});

/**
 * GET /api/menus/price-analysis
 * Fiyat analizi (bütçe bazlı restoran önerileri için)
 */
router.get('/price-analysis', async (req, res) => {
  try {
    const { budget, category, radius, latitude, longitude, personCount = 1 } = req.query;

    if (!budget || !latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: 'Bütçe, enlem ve boylam gerekli' 
      });
    }

    const budgetNum = parseFloat(budget);
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius) || 10;
    const personCountNum = parseInt(personCount) || 1;

    // Tüm menüleri getir
    const menus = await Menu.find({ 
      scrapingStatus: 'success',
      'items.0': { $exists: true } // En az 1 item olan menüler
    }).populate('restaurant', 'name city district latitude longitude category');

    // Lokasyon bazlı filtreleme
    const locationService = require('../services/locationService');
    const nearbyMenus = menus.filter(menu => {
      if (!menu.restaurant.latitude || !menu.restaurant.longitude) return false;
      
      const distance = locationService.calculateDistance(
        lat, lng,
        menu.restaurant.latitude, menu.restaurant.longitude
      );
      
      return distance <= radiusKm;
    });

    // Kategori filtresi
    let filteredMenus = nearbyMenus;
    if (category) {
      filteredMenus = nearbyMenus.filter(menu => 
        menu.restaurant.category === category
      );
    }

    // Bütçe analizi
    const analyzedMenus = filteredMenus.map(menu => {
      // Kişi başı ortalama fiyat hesapla
      const avgPricePerPerson = menu.metadata.averagePrice || 0;
      const estimatedTotal = avgPricePerPerson * personCountNum;
      
      // Bütçeye uygun mu?
      const fitsBudget = estimatedTotal <= budgetNum;
      const budgetRemaining = budgetNum - estimatedTotal;
      const budgetUsagePercent = (estimatedTotal / budgetNum * 100).toFixed(1);

      return {
        menuId: menu._id,
        restaurant: {
          name: menu.restaurant.name,
          city: menu.restaurant.city,
          district: menu.restaurant.district,
          category: menu.restaurant.category,
          latitude: menu.restaurant.latitude,
          longitude: menu.restaurant.longitude
        },
        menuStats: {
          totalItems: menu.metadata.totalItems,
          averagePrice: menu.metadata.averagePrice,
          minPrice: menu.metadata.minPrice,
          maxPrice: menu.metadata.maxPrice
        },
        budgetAnalysis: {
          estimatedTotal: estimatedTotal.toFixed(2),
          fitsBudget: fitsBudget,
          budgetRemaining: budgetRemaining.toFixed(2),
          budgetUsagePercent: budgetUsagePercent,
          personCount: personCountNum
        },
        recommendation: fitsBudget ? 'recommended' : 'over-budget',
        score: fitsBudget ? (100 - parseFloat(budgetUsagePercent)) : 0 // Bütçeye ne kadar uygun
      };
    });

    // Skora göre sırala
    analyzedMenus.sort((a, b) => b.score - a.score);

    res.json({ 
      success: true, 
      data: {
        totalRestaurants: analyzedMenus.length,
        recommended: analyzedMenus.filter(m => m.recommendation === 'recommended').length,
        restaurants: analyzedMenus.slice(0, 20) // İlk 20 öneri
      }
    });
  } catch (error) {
    console.error('Fiyat analizi hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fiyat analizi yapılamadı',
      error: error.message 
    });
  }
});

module.exports = router;

