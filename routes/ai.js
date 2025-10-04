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

// Tüm kullanıcılara push notification gönderme fonksiyonu
async function sendPushNotificationToAllUsers(title, body, data = {}) {
  try {
    // Tüm kullanıcıları getir
    const users = await User.find({});
    
    if (users.length === 0) {
      console.log('Bildirim gönderilecek kullanıcı bulunamadı');
      return;
    }

    // Expo push token'larını topla ve duplicate'ları kaldır
    const pushTokens = [...new Set(users
      .map(user => user.expoPushToken)
      .filter(token => token && token.trim() !== ''))];

    if (pushTokens.length === 0) {
      console.log('Geçerli push token bulunamadı');
      return;
    }

    console.log(`Push notification gönderiliyor: ${pushTokens.length} token'a`);
    console.log('Push tokens:', pushTokens);
    console.log('Message:', { title, body, data });

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

    console.log(`Push notification gönderildi: ${pushTokens.length} kullanıcıya`);
    console.log('Expo response:', response.data);
    
  } catch (error) {
    console.error('Push notification gönderme hatası:', error);
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
    const { restaurantName, campaignDescription, targetAudience, location, brandInfo, category } = req.body;

    if (!restaurantName || !campaignDescription) {
      return res.status(400).json({
        success: false,
        message: 'Restoran adı ve kampanya açıklaması gerekli!'
      });
    }

    console.log('AI Banner oluşturma isteği:', { restaurantName, campaignDescription, targetAudience });

    // AI servisine istek gönder
    let aiResponse;
    try {
      const aiServiceResponse = await axios.post(process.env.AI_SERVICE_URL + '/generate-banner', {
        restaurant_name: restaurantName,
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
          title: `${restaurantName}`,
          ai_generated_text: `🎉 ${campaignDescription}\n\n⭐ Harika fırsatlar\n⏰ Sınırlı süre\n📱 Hemen tıklayın!`,
          campaign_details: `Restoran: ${restaurantName}\nKampanya: ${campaignDescription}\nHedef: ${targetAudience}`,
          model: 'fallback',
          version: '1.0'
        }
      };
    }

    if (!aiResponse.success) {
      throw new Error(aiResponse.error || 'AI servis hatası');
    }

    // Restoran bilgilerini al veya oluştur
    let restaurant = await Restaurant.findOne({ name: restaurantName });
    
    if (!restaurant) {
      // Yeni restoran oluştur
      restaurant = new Restaurant({
        name: restaurantName,
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
        description: brandInfo?.description || `${restaurantName} restoranı`,
        isActive: true
      });
      
      await restaurant.save();
      console.log('Yeni restoran oluşturuldu:', restaurant._id);
    }

    // AI service'den gelen banner_image kullanılıyor
    // Görseli dosya olarak kaydet
    if (aiResponse.data.banner_image) {
        const filename = `banner_${restaurantName}_${Date.now()}.png`;
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
      status: 'active'
    });

    await newBanner.save();
    console.log('Yeni banner veritabanına kaydedildi:', newBanner._id);

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

    // OneSignal ile push notification gönder
    try {
      console.log('OneSignal bildirimi gönderiliyor...');
      await OneSignalService.sendNewBannerNotification({
        _id: newBanner._id,
        title: newBanner.title,
        restaurant: restaurant
      });
      console.log('OneSignal bildirimi gönderildi');
    } catch (oneSignalError) {
      console.error('OneSignal bildirimi gönderilemedi:', oneSignalError);
      
      // Fallback: Expo push notification gönder (sadece bir kere)
      console.log('Expo push notification fallback kullanılıyor...');
      await sendPushNotificationToAllUsers(
        `${campaignDescription}`,
        { bannerId: newBanner._id.toString() }
      );
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

module.exports = router; 