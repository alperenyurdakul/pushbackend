const express = require('express');
const router = express.Router();
const axios = require('axios');
const Banner = require('../models/Banner');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const OneSignalService = require('../services/oneSignalService');

// Push notification tokens storage (gerçek projede Redis veya veritabanında saklanmalı)
let notificationTokens = [];

// Bildirim sistemi (geçici olarak memory'de tutuyoruz)
let notifications = [];

// Yeni bildirim ekleme fonksiyonu
function addNotification(type, title, message, data = {}) {
  const notification = {
    id: Date.now().toString(),
    type: type,
    title: title,
    message: message,
    timestamp: new Date().toISOString(),
    isRead: false,
    data: data
  };
  
  notifications.unshift(notification); // En başa ekle
  
  // Son 100 bildirimi tut
  if (notifications.length > 100) {
    notifications = notifications.slice(0, 100);
  }
  
  console.log('Yeni bildirim eklendi:', title);
  return notification;
}

// Base64 görseli dosya olarak kaydet
function saveBase64Image(base64Data, filename) {
  try {
    // Base64'ten data URL'i çıkar
    const base64Image = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    
    // Uploads klasörünü oluştur
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Dosya yolı
    const filePath = path.join(uploadsDir, filename);
    
    // Base64'ü dosya olarak kaydet
    fs.writeFileSync(filePath, base64Image, 'base64');
    
    // URL döndür
    return `/uploads/${filename}`;
  } catch (error) {
    console.error('Görsel kaydetme hatası:', error);
    return null;
  }
}

// Push notification gönderme fonksiyonu
async function sendPushNotification(title, body, data = {}) {
  try {
    if (notificationTokens.length === 0) {
      console.log('Push notification token bulunamadı');
      return;
    }

    const message = {
      to: notificationTokens,
      sound: 'default',
      title: title,
      body: body,
      data: data,
    };

    const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });

    console.log('Push notification gönderildi:', response.data);
  } catch (error) {
    console.error('Push notification hatası:', error);
  }
}

// Filtrelenmiş kullanıcılara push notification gönderme fonksiyonu
async function sendPushNotificationToAllUsers(title, body, data = {}, bannerCity = null, bannerCategory = null) {
  try {
    // Filtreleme için sorgu oluştur
    const query = {
      userType: 'customer', // Sadece müşteriler
      expoPushToken: { $exists: true, $ne: null } // Push token'ı olan kullanıcılar
    };
    
    // Şehir filtresi - sadece tercih belirtmiş kullanıcılara uygula
    if (bannerCity) {
      query['$or'] = [
        { 'preferences.city': bannerCity },
        { 'preferences.city': { $exists: false } },
        { 'preferences.city': null }
      ];
    }
    
    // Kategori filtresi - sadece tercih belirtmiş kullanıcılara uygula
    if (bannerCategory) {
      if (!query['$or']) {
        query['$or'] = [];
      }
      const categoryFilter = {
        '$or': [
          { 'preferences.categories': bannerCategory },
          { 'preferences.categories': { $exists: false } },
          { 'preferences.categories': [] }
        ]
      };
      // Her iki filtre varsa AND mantığı uygula
      if (bannerCity) {
        query['$and'] = [
          { 
            '$or': [
              { 'preferences.city': bannerCity },
              { 'preferences.city': { $exists: false } },
              { 'preferences.city': null }
            ]
          },
          {
            '$or': [
              { 'preferences.categories': bannerCategory },
              { 'preferences.categories': { $exists: false } },
              { 'preferences.categories': [] }
            ]
          }
        ];
        delete query['$or'];
      } else {
        query['$or'] = categoryFilter['$or'];
      }
    }
    
    console.log('🔍 Bildirim filtresi:', {
      bannerCity,
      bannerCategory,
      query: JSON.stringify(query, null, 2)
    });
    
    // Filtrelenmiş kullanıcıları getir
    const users = await User.find(query);
    
    if (users.length === 0) {
      console.log('❌ Bildirim gönderilecek kullanıcı bulunamadı (filtre uygulandı)');
      return;
    }

    // Expo push token'larını topla ve duplicate'ları kaldır
    const pushTokens = [...new Set(users
      .map(user => user.expoPushToken)
      .filter(token => token && token.trim() !== ''))];

    if (pushTokens.length === 0) {
      console.log('❌ Geçerli push token bulunamadı');
      return;
    }

    console.log(`📱 Push notification gönderiliyor: ${pushTokens.length} token'a`);
    console.log(`📍 Şehir filtresi: ${bannerCity || 'Yok'}`);
    console.log(`🏷️ Kategori filtresi: ${bannerCategory || 'Yok'}`);

    // Expo push notification gönder
    const message = {
      to: pushTokens,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
    };

    const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
    });

    console.log(`✅ Push notification gönderildi: ${pushTokens.length} kullanıcıya`);
    console.log('Expo response:', response.data);
    
  } catch (error) {
    console.error('❌ Push notification gönderme hatası:', error);
  }
}

// Push token kaydetme
router.post('/register-token', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token gerekli!'
      });
    }

    // Token zaten varsa ekleme
    if (!notificationTokens.includes(token)) {
      notificationTokens.push(token);
      console.log('Yeni push token kaydedildi:', token);
    }

    res.json({
      success: true,
      message: 'Push token başarıyla kaydedildi!'
    });
  } catch (error) {
    console.error('Push token kaydetme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Push token kaydedilirken hata oluştu!',
      error: error.message
    });
  }
});

// OneSignal test endpoint'i
router.post('/test-onesignal', async (req, res) => {
  try {
    const { externalUserId, title, message } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Başlık ve mesaj gerekli!'
      });
    }

    let result;
    if (externalUserId) {
      // Belirli kullanıcıya gönder
      result = await OneSignalService.sendToUser(externalUserId, title, message, {
        type: 'test_notification',
        timestamp: new Date().toISOString()
      });
    } else {
      // Tüm kullanıcılara gönder
      result = await OneSignalService.sendToAll(title, message, {
        type: 'test_notification',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'OneSignal test bildirimi gönderildi!',
      data: result
    });
  } catch (error) {
    console.error('OneSignal test hatası:', error);
    res.status(500).json({
      success: false,
      message: 'OneSignal test bildirimi gönderilemedi!',
      error: error.message
    });
  }
});

// Test route - router'ın çalışıp çalışmadığını kontrol etmek için
router.get('/test', (req, res) => {
  res.json({ 
    message: 'AI router çalışıyor!',
    timestamp: new Date().toISOString(),
    routes: [
      'GET /generate-banner',
      'GET /banners',
      'GET /banners/active',
      'GET /banners/:id',
      'PUT /banners/:id/stats',
      'DELETE /banners/:id',
      'GET /notifications'
    ]
  });
});

// AI Banner oluşturma endpoint'i
router.post('/generate-banner', async (req, res) => {
  try {
    const { restaurantId, restaurantName, campaignDescription, targetAudience, location, brandInfo, category, codeQuota } = req.body;

    // JWT token'dan kullanıcı bilgilerini al
    let user = null;
    const token = req.headers.authorization?.replace('Bearer ', '');
    console.log('🔐 JWT Token kontrolü:', {
      hasToken: !!token,
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 20) + '...' : 'Yok'
    });
    
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.userId);
        console.log('👤 Kullanıcı bulundu:', {
          userId: user?._id,
          name: user?.name,
          logo: user?.logo,
          category: user?.category
        });
      } catch (jwtError) {
        console.log('❌ JWT token hatası:', jwtError.message);
      }
    } else {
      console.log('⚠️ JWT token bulunamadı');
    }

    // restaurantId varsa restoran bilgisini al, yoksa restaurantName kullan
    let restaurant = null;
    if (restaurantId) {
      restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        return res.status(400).json({
          success: false,
          message: 'Restoran bulunamadı!'
        });
      }
    }

    if (!restaurant && !restaurantName) {
      return res.status(400).json({
        success: false,
        message: 'Restoran ID veya Restoran adı gerekli!'
      });
    }

    if (!campaignDescription) {
      return res.status(400).json({
        success: false,
        message: 'Kampanya açıklaması gerekli!'
      });
    }

    const finalRestaurantName = restaurant ? restaurant.name : restaurantName;

    // Kod doğrulama ve kota kontrolü
    if (restaurant) {
      // Kota kontrolü
      if (restaurant.codeQuota.remaining <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Kota limiti doldu! Daha fazla banner oluşturamazsınız.'
        });
      }

      // Kod doğrulama (eğer kod gönderilmişse)
      const { verificationCode } = req.body;
      if (verificationCode && restaurant.verificationCode) {
        if (verificationCode !== restaurant.verificationCode) {
          return res.status(400).json({
            success: false,
            message: 'Doğrulama kodu hatalı!'
          });
        }
      }

      console.log('Kota kontrolü geçildi:', {
        total: restaurant.codeQuota.total,
        used: restaurant.codeQuota.used,
        remaining: restaurant.codeQuota.remaining
      });
    }

    console.log('AI Banner oluşturma isteği:', { finalRestaurantName, campaignDescription, targetAudience });

    // AI servisine istek gönder
    let aiResponse;
    try {
      const aiServiceResponse = await axios.post(process.env.AI_SERVICE_URL + '/generate-banner', {
        restaurant_name: finalRestaurantName,
        campaign_description: campaignDescription,
        target_audience: targetAudience
      }, {
        timeout: 30000
      });

      aiResponse = aiServiceResponse.data;
      console.log('=== AI SERVICE DEBUG ===');
      console.log('AI Service yanıtı:', JSON.stringify(aiResponse, null, 2));
      console.log('AI Service data field:', Object.keys(aiResponse.data || {}));
      console.log('Banner image var mı:', !!aiResponse.data?.banner_image);
      console.log('Banner image uzunluğu:', aiResponse.data?.banner_image ? aiResponse.data.banner_image.length : 0);
      console.log('Banner image ilk 100 karakter:', aiResponse.data?.banner_image ? aiResponse.data.banner_image.substring(0, 100) : 'YOK');
      console.log('========================');
    } catch (aiError) {
      console.error('AI Service hatası:', aiError.message);
      
      // Fallback: Basit banner oluştur
      aiResponse = {
        success: true,
        data: {
          title: `${finalRestaurantName}`,
          ai_generated_text: `🎉 ${campaignDescription}\n\n⭐ Harika fırsatlar\n⏰ Sınırlı süre\n📱 Hemen tıklayın!`,
          campaign_details: `Restoran: ${finalRestaurantName}\nKampanya: ${campaignDescription}\nHedef: ${targetAudience}`,
          model: 'fallback',
          version: '1.0'
        }
      };
    }

    if (!aiResponse.success) {
      throw new Error(aiResponse.error || 'AI servis hatası');
    }

    // Restoran bilgilerini al veya oluştur
    if (!restaurant) {
      restaurant = await Restaurant.findOne({ name: finalRestaurantName });
    }
    
    if (!restaurant) {
      // Yeni restoran oluştur
      restaurant = new Restaurant({
        name: finalRestaurantName,
        type: brandInfo?.type || 'restaurant',
        address: {
          city: location?.city || 'İstanbul',
          district: location?.district || 'Genel',
          fullAddress: location?.address || ''
        },
        contact: {
          phone: '+90 555 123 45 67',
          email: 'info@restoran.com'
        },
        workingHours: {
          monday: { open: '09:00', close: '22:00' },
          tuesday: { open: '09:00', close: '22:00' },
          wednesday: { open: '09:00', close: '22:00' },
          thursday: { open: '09:00', close: '22:00' },
          friday: { open: '09:00', close: '23:00' },
          saturday: { open: '10:00', close: '23:00' },
          sunday: { open: '10:00', close: '22:00' }
        },
        logo: null,
        description: brandInfo?.description || `${finalRestaurantName} restoranı`,
        isActive: true
      });
      
      await restaurant.save();
      console.log('Yeni restoran oluşturuldu:', restaurant._id);
    }

    // AI service'den gelen banner_image kullanılıyor
    // Görseli dosya olarak kaydet
    if (aiResponse.data.banner_image) {
        const filename = `banner_${finalRestaurantName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`;
        const image_url = saveBase64Image(aiResponse.data.banner_image, filename);
        if (image_url) {
            console.log(`Görsel kaydedildi: ${image_url}`);
        } else {
            console.log("Görsel kaydedilemedi, base64 kullanılıyor");
        }
    } else {
        console.log("AI görsel bulunamadı");
    }

    console.log("AI Service'den banner alındı");

    // Yeni banner oluştur
    const newBanner = new Banner({
      restaurant: restaurant._id,
      title: aiResponse.data.title,
      description: campaignDescription,
      aiGeneratedText: aiResponse.data.ai_generated_text,
      bannerImage: aiResponse.data.banner_image, // AI'dan gelen görsel
      category: category || 'Kahve', // Kategori ekle
      bannerLocation: {
        city: location?.city || 'İstanbul',
        district: location?.district || 'Genel',
        address: location?.address || ''
      },
      campaign: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 gün sonra
        startTime: '00:00',
        endTime: '23:59',
        daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        isActive: true
      },
      targetAudience: {
        ageRange: { min: 18, max: 65 },
        gender: 'all',
        location: { radius: 10, coordinates: { lat: 40.9909, lng: 29.03 } }
      },
      stats: {
        views: 0,
        clicks: 0,
        conversions: 0
      },
      aiModel: {
        model: aiResponse.data.model || 'gpt-4',
        version: aiResponse.data.version || '1.0',
        generationDate: new Date()
      },
      status: 'active',
      codeQuota: {
        total: codeQuota || 10,
        used: 0,
        remaining: codeQuota || 10
      },
      brandProfile: user ? {
        logo: user.logo || null,
        description: user.description || '',
        category: user.category || category || 'Kahve',
        brandType: user.brandType || 'Restoran',
        email: user.email || '',
        address: user.address || '',
        city: user.city || location?.city || 'İstanbul',
        district: user.district || location?.district || 'Genel'
      } : {
        logo: null,
        description: '',
        category: category || 'Kahve',
        brandType: 'Restoran',
        email: '',
        address: '',
        city: location?.city || 'İstanbul',
        district: location?.district || 'Genel'
      }
    });

    console.log('🎨 Banner brandProfile bilgileri:', {
      logo: newBanner.brandProfile?.logo,
      description: newBanner.brandProfile?.description,
      category: newBanner.brandProfile?.category,
      userLogo: user?.logo
    });

    await newBanner.save();
    console.log('Yeni banner veritabanına kaydedildi:', newBanner._id);

    // Kota güncellemesi
    if (restaurant) {
      restaurant.codeQuota.used += 1;
      restaurant.codeQuota.remaining = restaurant.codeQuota.total - restaurant.codeQuota.used;
      await restaurant.save();
      console.log('Kota güncellendi:', {
        total: restaurant.codeQuota.total,
        used: restaurant.codeQuota.used,
        remaining: restaurant.codeQuota.remaining
      });
    }

    // Bildirim ekle (bildirimler tab'ında görünmesi için)
    addNotification(
      'new_banner',
      'Yeni Kampanya!',
      `${campaignDescription}`,
      { 
        bannerId: newBanner._id.toString(),
        restaurantName: restaurantName,
        bannerTitle: newBanner.title
      }
    );

    // OneSignal Push Notification gönder (şehir ve kategori filtreli)
    try {
      console.log('📱 OneSignal push notification gönderiliyor (filtreli)...');
      const bannerCity = newBanner.bannerLocation?.city || null;
      const bannerCategory = category || null;
      
      const oneSignalResult = await OneSignalService.sendToAll(
        `🎉 Yeni Kampanya!`,
        `${restaurant.name} - ${campaignDescription}`,
        { 
          type: 'new_banner',
          bannerId: newBanner._id.toString(),
          restaurantName: restaurant.name,
          timestamp: new Date().toISOString()
        },
        bannerCity,  // Şehir filtresi
        bannerCategory  // Kategori filtresi
      );
      console.log('✅ OneSignal push notification gönderildi:', oneSignalResult);
    } catch (oneSignalError) {
      console.error('❌ OneSignal push notification gönderilemedi:', oneSignalError);
    }

    // Expo Push Notification gönder (şehir ve kategori filtreli)
    try {
      console.log('📱 Expo push notification gönderiliyor (filtreli)...');
      const bannerCity = newBanner.bannerLocation?.city || null;
      const bannerCategory = category || null;
      
      await sendPushNotificationToAllUsers(
        `🎉 Yeni Kampanya!`,
        `${restaurant.name} - ${campaignDescription}`,
        { 
          type: 'new_banner',
          bannerId: newBanner._id.toString(),
          restaurantName: restaurant.name,
          timestamp: new Date().toISOString()
        },
        bannerCity,  // Şehir filtresi
        bannerCategory  // Kategori filtresi
      );
      console.log('✅ Expo push notification gönderildi');
    } catch (expoError) {
      console.error('❌ Expo push notification gönderilemedi:', expoError);
    }

    res.json({
      success: true,
      message: 'Banner başarıyla oluşturuldu',
      data: {
        _id: newBanner._id,
        restaurant: {
          name: restaurant.name,
          type: restaurant.type,
          address: restaurant.address,
          contact: restaurant.contact
        },
        title: newBanner.title,
        description: newBanner.description,
        aiGeneratedText: newBanner.aiGeneratedText,
        bannerLocation: newBanner.bannerLocation,
        campaignDetails: aiResponse.data.campaign_details,
        targetAudience: targetAudience,
        status: newBanner.status,
        stats: newBanner.stats,
        aiModel: newBanner.aiModel,
        createdAt: newBanner.createdAt,
        updatedAt: newBanner.updatedAt
      }
    });

  } catch (error) {
    console.error('Banner oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner oluşturulurken hata oluştu!',
      error: error.message
    });
  }
});

// Bildirimleri getir
router.get('/notifications', (req, res) => {
  try {
    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Bildirim getirme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirimler alınırken hata oluştu!'
    });
  }
});

// Banner analizi
router.post('/analyze-banner', async (req, res) => {
  try {
    const { bannerText, targetAudience } = req.body;

    if (!bannerText) {
      return res.status(400).json({
        success: false,
        message: 'Banner metni gerekli!'
      });
    }

    console.log('Banner analizi isteği:', { bannerText, targetAudience });

    // AI servisine analiz isteği gönder
    let aiResponse;
    try {
      const aiServiceResponse = await axios.post(process.env.AI_SERVICE_URL + '/analyze-banner', {
        banner_text: bannerText,
        target_audience: targetAudience
      }, {
        timeout: 30000
      });

      aiResponse = aiServiceResponse.data;
    } catch (aiError) {
      console.error('AI Service analiz hatası:', aiError.message);
      
      // Fallback analiz
      aiResponse = {
        success: true,
        data: {
          analysis: `Banner metni analiz edildi: "${bannerText}"`,
          suggestions: ['Daha etkileyici olabilir', 'Hedef kitleye uygun'],
          score: 7.5
        }
      };
    }

    res.json({
      success: true,
      data: aiResponse.data
    });

  } catch (error) {
    console.error('Banner analizi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Banner analiz edilirken hata oluştu!',
      error: error.message
    });
  }
});

// Banner'ları listele (AI route üzerinden)
router.get('/banners', async (req, res) => {
  try {
    const { restaurantName } = req.query;
    
    let query = {};
    if (restaurantName) {
      // Restoran adına göre filtrele
      const restaurant = await Restaurant.findOne({ name: restaurantName });
      if (restaurant) {
        query.restaurant = restaurant._id;
      }
    }
    
    const banners = await Banner.find(query).populate('restaurant');
    
    // Sadece belirtilen restoran'a ait banner'ları döndür
    const filteredBanners = restaurantName ? 
      banners.filter(banner => banner.restaurant && banner.restaurant.name === restaurantName) : 
      banners;
    
    res.json({
      success: true,
      data: filteredBanners
    });
  } catch (error) {
    console.error('Banner\'lar listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner\'lar listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// Banner silme endpoint'i
router.delete('/banners/:id', async (req, res) => {
  console.log('🚨 DELETE /banners/:id route çağrıldı');
  console.log('🚨 URL:', req.url);
  console.log('🚨 Method:', req.method);
  console.log('🚨 Params:', req.params);
  console.log('🚨 Query:', req.query);
  console.log('🚨 Headers:', req.headers);
  
  try {
    const { id } = req.params;
    const { restaurantName } = req.query; // Hangi restoranın banner'ı olduğunu kontrol etmek için

    console.log(`🚨 Banner ID: ${id}`);
    console.log(`🚨 Restaurant Name: ${restaurantName}`);

    // Banner'ı bul ve restaurant bilgisini populate et
    const banner = await Banner.findById(id).populate('restaurant');
    
    if (!banner) {
      console.log('🚨 Banner bulunamadı');
      return res.status(404).json({ message: 'Banner bulunamadı' });
    }

    console.log('🚨 Banner bulundu:', banner);
    console.log('🚨 Banner restaurant:', banner.restaurant);

    // Banner'ın gerçekten o restoranın olup olmadığını kontrol et
    if (banner.restaurant.name !== restaurantName) {
      console.log('🚨 Yetki hatası - Banner bu restorana ait değil');
      console.log('🚨 Banner restaurant:', banner.restaurant.name);
      console.log('🚨 Requested restaurant:', restaurantName);
      return res.status(403).json({ message: 'Bu banner\'ı silme yetkiniz yok' });
    }

    // Banner'ı sil
    const deletedBanner = await Banner.findByIdAndDelete(id);
    console.log(`🚨 Banner silindi: ${id} - Restoran: ${restaurantName}`);
    
    res.json({ 
      message: 'Banner başarıyla silindi',
      deletedBanner 
    });
  } catch (error) {
    console.error('🚨 Banner silme hatası:', error);
    res.status(500).json({ message: 'Banner silinirken hata oluştu' });
  }
});

// Aktif banner'ları listele
router.get('/banners/active', async (req, res) => {
  try {
    const { restaurantName } = req.query;
    
    let query = { status: 'active' };
    if (restaurantName) {
      // Restoran adına göre filtrele
      const restaurant = await Restaurant.findOne({ name: restaurantName });
      if (restaurant) {
        query.restaurant = restaurant._id;
      }
    }
    
    const activeBanners = await Banner.find(query).populate('restaurant');
    
    console.log('Backend: Found banners:', activeBanners.length);
    console.log('Backend: Banner categories:', activeBanners.map(b => ({ 
      id: b._id, 
      title: b.title, 
      category: b.category,
      restaurant: b.restaurant?.name 
    })));
    
    res.json({
      success: true,
      data: activeBanners
    });
  } catch (error) {
    console.error('Aktif banner\'lar listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Aktif banner\'lar listelenirken hata oluştu!',
      error: error.message
    });
  }
});

// Banner detayı getir
router.get('/banners/:id', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id).populate('restaurant');
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    res.json({
      success: true,
      data: banner
    });
  } catch (error) {
    console.error('Banner getirilirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner getirilirken hata oluştu!',
      error: error.message
    });
  }
});

// Banner istatistiklerini güncelle
router.put('/banners/:id/stats', async (req, res) => {
  try {
    const { views, clicks, conversions } = req.body;
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { 
        $inc: { 
          'stats.views': views || 0,
          'stats.clicks': clicks || 0,
          'stats.conversions': conversions || 0
        },
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }
    
    res.json({
      success: true,
      message: 'Banner istatistikleri güncellendi!',
      data: banner
    });
  } catch (error) {
    console.error('Banner istatistikleri güncellenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Banner istatistikleri güncellenirken hata oluştu!',
      error: error.message
    });
  }
});

// Route'ları console'da göster
console.log('🔧 AI Routes kayıtlı:');
console.log('  - POST /generate-banner');
console.log('  - GET /banners');
console.log('  - GET /banners/active');
console.log('  - GET /banners/:id');
console.log('  - PUT /banners/:id/stats');
console.log('  - DELETE /banners/:id');
console.log('  - GET /notifications');
console.log('  - POST /register-token');
console.log('  - POST /test-onesignal');
console.log('  - POST /generate-verification-code');
console.log('  - GET /restaurant-quota/:restaurantId');
console.log('  - POST /verify-customer-code');

// Doğrulama kodu oluşturma
router.post('/generate-verification-code', async (req, res) => {
  try {
    const { restaurantId } = req.body;
    
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: 'Restoran ID gerekli!'
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    // 6 haneli rastgele kod oluştur
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    restaurant.verificationCode = verificationCode;
    await restaurant.save();

    console.log('Doğrulama kodu oluşturuldu:', {
      restaurantId,
      restaurantName: restaurant.name,
      verificationCode
    });

    res.json({
      success: true,
      message: 'Doğrulama kodu oluşturuldu',
      data: {
        verificationCode,
        restaurantName: restaurant.name
      }
    });
  } catch (error) {
    console.error('Doğrulama kodu oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Doğrulama kodu oluşturulamadı'
    });
  }
});

// Restoran kota bilgilerini getir
router.get('/restaurant-quota/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restoran bulunamadı!'
      });
    }

    res.json({
      success: true,
      data: {
        restaurantName: restaurant.name,
        codeQuota: restaurant.codeQuota,
        hasVerificationCode: !!restaurant.verificationCode
      }
    });
  } catch (error) {
    console.error('Kota bilgisi alma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kota bilgisi alınamadı'
    });
  }
});

// Test için kod oluştur (token gerektirmez)
router.post('/create-test-code', async (req, res) => {
  try {
    const { bannerId, phone } = req.body;
    
    if (!bannerId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Banner ID ve telefon numarası gerekli!'
      });
    }

    // Test kullanıcısı oluştur veya bul
    const User = require('../models/User');
    let user = await User.findOne({ phone });
    
    if (!user) {
      user = new User({
        name: 'Test User',
        phone: phone,
        isActive: true
      });
      await user.save();
    }

    // CodeHistory modelini import et
    const CodeHistory = require('../models/CodeHistory');
    
    // 6 haneli kod oluştur
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Veritabanına kaydet
    const codeHistory = new CodeHistory({
      userId: user._id,
      phone: phone,
      bannerId: bannerId,
      code: code
    });
    
    await codeHistory.save();
    
    console.log('Test kodu oluşturuldu:', {
      code,
      bannerId,
      phone,
      userId: user._id
    });

    res.json({
      success: true,
      message: 'Test kodu oluşturuldu',
      data: {
        code: code,
        bannerId: bannerId,
        phone: phone,
        expiresIn: '24 saat'
      }
    });

  } catch (error) {
    console.error('Test kodu oluşturma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Test kodu oluşturma hatası'
    });
  }
});

// Müşteri kodunu doğrula (Dashboard'dan)
router.post('/verify-customer-code', async (req, res) => {
  try {
    const { code, bannerId } = req.body;
    
    if (!code || !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Kod ve banner ID gerekli!'
      });
    }

    // CodeHistory modelini import et
    const CodeHistory = require('../models/CodeHistory');
    
    // Kodu ara
    const codeRecord = await CodeHistory.findOne({
      bannerId: bannerId,
      code: code,
      used: false
    }).populate('userId', 'phone name');

    if (!codeRecord) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kod veya kod zaten kullanılmış!'
      });
    }

    // Kodun 24 saat içinde oluşturulup oluşturulmadığını kontrol et
    const now = new Date();
    const codeAge = (now - codeRecord.createdAt) / (1000 * 60 * 60); // saat cinsinden
    
    if (codeAge > 24) {
      return res.status(400).json({
        success: false,
        message: 'Kodun süresi dolmuş! (24 saat)'
      });
    }

    // Kodu kullanılmış olarak işaretle
    codeRecord.used = true;
    codeRecord.usedAt = now;
    await codeRecord.save();

    // Banner'ın istatistiklerini ve kota bilgisini güncelle
    const banner = await Banner.findById(bannerId);
    if (banner) {
      banner.stats.conversions += 1;
      banner.codeQuota.used += 1;
      banner.codeQuota.remaining = banner.codeQuota.total - banner.codeQuota.used;
      await banner.save();
      
      console.log('Banner kota güncellendi:', {
        bannerId: banner._id,
        total: banner.codeQuota.total,
        used: banner.codeQuota.used,
        remaining: banner.codeQuota.remaining
      });
    }

    console.log('Müşteri kodu doğrulandı:', {
      code,
      bannerId,
      userId: codeRecord.userId._id,
      phone: codeRecord.userId.phone
    });

    res.json({
      success: true,
      message: 'Kod başarıyla doğrulandı ve indirim uygulandı!',
      data: {
        code: code,
        bannerId: bannerId,
        customerPhone: codeRecord.userId.phone,
        customerName: codeRecord.userId.name,
        usedAt: now
      }
    });

  } catch (error) {
    console.error('Müşteri kodu doğrulama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kod doğrulama hatası'
    });
  }
});

module.exports = router; 