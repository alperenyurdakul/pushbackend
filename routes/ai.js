const express = require('express');
const router = express.Router();
const axios = require('axios');
const mongoose = require('mongoose');
const Banner = require('../models/Banner');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const BannerClick = require('../models/BannerClick');
const fs = require('fs');
const path = require('path');
const OneSignalService = require('../services/oneSignalService');
const { uploadBase64ToS3 } = require('../middleware/uploadS3');

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
    const { restaurantId, restaurantName, title, campaignDescription, targetAudience, location, brandInfo, category, codeQuota, codeSettings, campaign, offerType, offerDetails, menu, bannerImage } = req.body;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 LOCATION DATA KONTROLÜ:');
    console.log('location:', JSON.stringify(location, null, 2));
    console.log('location.coordinates:', location?.coordinates);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // JWT token'dan kullanıcı bilgilerini al ve EN GÜNCEL halini veritabanından çek
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
        // EN GÜNCEL kullanıcı bilgilerini veritabanından çek (logo güncellemesi için)
        user = await User.findById(decoded.userId);
        console.log('👤 Kullanıcı bulundu (EN GÜNCEL):', {
          userId: user?._id,
          name: user?.name,
          logo: user?.logo,
          logoExists: !!user?.logo,
          category: user?.category,
          userType: user?.userType,
          credits: user?.credits
        });
      } catch (jwtError) {
        console.log('❌ JWT token hatası:', jwtError.message);
      }
    } else {
      console.log('⚠️ JWT token bulunamadı');
    }

    // Kredi kontrolü (sadece brand ve eventBrand için)
    if (user && (user.userType === 'brand' || user.userType === 'eventBrand')) {
      // Kredi bilgisi yoksa veya null/undefined ise, default olarak 5 kredi ver
      if (user.credits === undefined || user.credits === null) {
        user.credits = 5;
        await user.save();
        console.log('💳 Kredi bilgisi yoktu, 5 kredi eklendi');
      }
      
      if (user.credits <= 0) {
        return res.status(403).json({
          success: false,
          message: 'Krediniz yetersiz! Banner oluşturmak için kredinizi yenilemeniz gerekiyor.',
          currentCredits: user.credits || 0
        });
      }
      console.log('💳 Kredi kontrolü geçildi:', {
        currentCredits: user.credits,
        willBeAfter: user.credits - 1
      });
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

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Kampanya başlığı gerekli!'
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
        logo: user?.logo || null, // Kullanıcının logosunu kullan
        description: brandInfo?.description || `${finalRestaurantName} restoranı`,
        isActive: true
      });
      
      await restaurant.save();
      console.log('Yeni restoran oluşturuldu:', restaurant._id, 'Logo:', user?.logo || 'Yok');
    } else {
      // Mevcut restaurant varsa ve logo yoksa, user'ın logosunu ekle
      if (user?.logo && !restaurant.logo) {
        restaurant.logo = user.logo;
        await restaurant.save();
        console.log('🏪 Restaurant logosu güncellendi:', user.logo);
      }
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

    // Kod tipi validasyonu
    if (codeSettings?.codeType === 'fixed') {
      if (!codeSettings.fixedCode || codeSettings.fixedCode.length < 4 || codeSettings.fixedCode.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'Sabit kod 4-20 karakter arası olmalıdır!'
        });
      }
      if (!/^[a-zA-Z0-9]+$/.test(codeSettings.fixedCode)) {
        return res.status(400).json({
          success: false,
          message: 'Sabit kod sadece harf ve rakam içerebilir!'
        });
      }
      console.log('🔒 Sabit kod banner oluşturuluyor:', codeSettings.fixedCode);
    } else {
      console.log('🎲 Random kod banner oluşturuluyor');
    }

    // Kullanıcının userType'ına göre contentType belirle
    const contentType = user?.userType === 'eventBrand' ? 'event' : 'campaign';
    
    // Banner görseli - Base64 ise S3'e yükle
    let finalBannerImage = null;
    try {
      if (bannerImage && bannerImage.startsWith('data:image/')) {
        // Base64 görseli S3'e yükle
        console.log('📤 Base64 görseli S3e yükleniyor...');
        finalBannerImage = await uploadBase64ToS3(bannerImage, 'banners');
        console.log('✅ Görsel S3e yüklendi:', finalBannerImage);
      } else if (bannerImage && (bannerImage.startsWith('http://') || bannerImage.startsWith('https://'))) {
        // Zaten tam URL ise direkt kullan
        finalBannerImage = bannerImage;
        console.log('✅ Görsel zaten URL:', finalBannerImage);
      } else {
        // AI'dan gelen görsel veya yok
        finalBannerImage = aiResponse.data.banner_image || bannerImage;
        console.log('ℹ️ Görsel AIdan veya yok');
      }
    } catch (imageError) {
      console.error('❌ Banner görseli yüklenirken hata:', imageError);
      // Hata durumunda AI'dan gelen görseli kullan
      finalBannerImage = aiResponse.data.banner_image || null;
    }
    
    // Yeni banner oluştur
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 BANNER LOCATION OLUŞTURULUYOR:');
    console.log('location.city:', location?.city);
    console.log('location.district:', location?.district);
    console.log('location.address:', location?.address);
    console.log('location.coordinates:', JSON.stringify(location?.coordinates));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const newBanner = new Banner({
      restaurant: restaurant._id,
      title: title || aiResponse.data.title,
      description: campaignDescription,
      aiGeneratedText: aiResponse.data.ai_generated_text,
      bannerImage: finalBannerImage, // S3'e yüklenmiş veya hazır URL
      category: category || 'Kahve', // Kategori ekle
      contentType: contentType, // Etkinlik mi kampanya mı
      bannerLocation: {
        city: location?.city || 'İstanbul',
        district: location?.district || 'Genel',
        address: location?.address || '',
        coordinates: location?.coordinates || { latitude: null, longitude: null }
      },
      campaign: {
        startDate: campaign?.startDate ? new Date(campaign.startDate) : new Date(),
        endDate: campaign?.endDate ? new Date(campaign.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        startTime: campaign?.startTime || '00:00',
        endTime: campaign?.endTime || '23:59',
        daysOfWeek: campaign?.daysOfWeek || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
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
      menu: menu || { link: null, image: null },
      codeSettings: {
        codeType: codeSettings?.codeType || 'random',
        fixedCode: codeSettings?.codeType === 'fixed' ? codeSettings.fixedCode : null
      },
      aiModel: {
        model: aiResponse.data.model || 'gpt-4',
        version: aiResponse.data.version || '1.0',
        generationDate: new Date()
      },
      status: 'active',
      approvalStatus: 'pending', // Admin onayı bekliyor
      offerType: offerType || 'percentage',
      offerDetails: offerDetails || {},
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
    console.log('Yeni banner veritabanına kaydedildi (ONAY BEKLİYOR):', newBanner._id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📍 KAYDEDİLEN BANNER LOCATION:');
    console.log('bannerLocation:', JSON.stringify(newBanner.bannerLocation, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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

    // Kullanıcının kredisini azalt (sadece brand ve eventBrand için)
    if (user && (user.userType === 'brand' || user.userType === 'eventBrand')) {
      user.credits -= 1;
      await user.save();
      console.log('💳 Kullanıcı kredisi azaltıldı:', {
        userId: user._id,
        previousCredits: user.credits + 1,
        currentCredits: user.credits
      });
    }

    // NOT: Bildirimler admin onayından sonra gönderilecek
    console.log('⏳ Banner admin onayı bekliyor. Onaylandığında bildirim gönderilecek.');

    res.json({
      success: true,
      message: 'Banner oluşturuldu ve admin onayı bekleniyor. Onaylandığında kullanıcılara görünür olacak.',
      approvalStatus: 'pending',
      remainingCredits: user ? user.credits : null,
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
    
    // Sadece gerekli fieldları getir
    const banners = await Banner.find(query)
      .select('title description category status approvalStatus createdAt validUntil bannerLocation restaurant brandProfile stats bannerImage codeQuota')
      .populate('restaurant', 'name logo')
      .populate('brandProfile', 'logo city brandType')
      .lean(); // JSON object döndür (hızlı)
    
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

// Aktif banner'ları listele (Sadece onaylanmış banner'lar)
router.get('/banners/active', async (req, res) => {
  try {
    const { restaurantName } = req.query;
    
    // Kullanıcının şehir tercihini al (token varsa)
    let userCity = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user && user.preferences && user.preferences.city) {
          userCity = user.preferences.city;
          console.log('📍 Kullanıcı şehir tercihi:', userCity);
        }
      }
    } catch (tokenError) {
      // Token yoksa veya geçersizse devam et (misafir kullanıcılar için)
      console.log('ℹ️ Token yok veya geçersiz, şehir filtresi uygulanmayacak');
    }
    
    // Campaign tipindeki VE ONAYLANMIŞ banner'ları getir (contentType null olanlar da dahil - geriye uyumluluk)
    let query = { 
      status: 'active',
      approvalStatus: 'approved', // Sadece onaylanmış banner'lar
      $or: [
        { contentType: 'campaign' },
        { contentType: { $exists: false } }, // Eski banner'lar için
        { contentType: null } // Null olanlar için
      ]
    };
    
    if (restaurantName) {
      // Restoran adına göre filtrele
      const restaurant = await Restaurant.findOne({ name: restaurantName });
      if (restaurant) {
        query.restaurant = restaurant._id;
      }
    }
    
    // Sadece gerekli fieldları getir - En yeni kampanyalar önce
    let activeBanners = await Banner.find(query)
      .select('title description category status approvalStatus createdAt validUntil bannerLocation restaurant brandProfile stats bannerImage campaign startDate endDate codeQuota')
      .populate('restaurant', 'name logo address averageRating totalReviews')
      .populate('brandProfile', 'logo city brandType address')
      .sort({ createdAt: -1 }) // En yeni önce
      .lean(); // JSON object döndür (hızlı)
    
    // Kullanıcının şehir tercihine göre filtrele
    if (userCity) {
      const filteredBanners = activeBanners.filter(banner => {
        // Banner'ın şehir bilgisini kontrol et
        const bannerCity = banner.bannerLocation?.city || 
                          banner.brandProfile?.city || 
                          banner.restaurant?.address?.city;
        
        // Şehir eşleşiyorsa veya şehir bilgisi yoksa göster (şehir bilgisi olmayan banner'ları da göster)
        return !bannerCity || bannerCity === userCity;
      });
      
      console.log(`📍 Şehir filtresi uygulandı: ${userCity}`);
      console.log(`   Filtreleme öncesi: ${activeBanners.length} banner`);
      console.log(`   Filtreleme sonrası: ${filteredBanners.length} banner`);
      activeBanners = filteredBanners;
    }
    
    console.log('Backend: Found banners:', activeBanners.length);
    console.log('Backend: Banner categories:', activeBanners.map(b => ({ 
      id: b._id, 
      title: b.title, 
      category: b.category,
      contentType: b.contentType,
      restaurant: b.restaurant?.name,
      city: b.bannerLocation?.city || b.brandProfile?.city || b.restaurant?.address?.city
    })));
    
    // Debug: İlk banner'ın campaign verisini logla
    if (activeBanners.length > 0) {
      console.log('🔍 İlk banner campaign verisi:', JSON.stringify(activeBanners[0].campaign, null, 2));
      console.log('📍 İlk banner restaurant address:', JSON.stringify(activeBanners[0].restaurant?.address, null, 2));
      console.log('📍 İlk banner restaurant coordinates:', activeBanners[0].restaurant?.address?.coordinates);
    }
    
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

// Etkinlik banner'larını getir (Sadece onaylanmış)
router.get('/banners/events', async (req, res) => {
  try {
    // Kullanıcının şehir tercihini al (token varsa)
    let userCity = null;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user && user.preferences && user.preferences.city) {
          userCity = user.preferences.city;
          console.log('📍 Kullanıcı şehir tercihi (events):', userCity);
        }
      }
    } catch (tokenError) {
      // Token yoksa veya geçersizse devam et (misafir kullanıcılar için)
      console.log('ℹ️ Token yok veya geçersiz, şehir filtresi uygulanmayacak');
    }
    
    // Sadece event tipindeki VE ONAYLANMIŞ banner'ları getir - En yeni etkinlikler önce
    let eventBanners = await Banner.find({ 
      status: 'active', 
      contentType: 'event',
      approvalStatus: 'approved' // Sadece onaylanmış banner'lar
    })
    .select('title description category status approvalStatus createdAt validUntil bannerLocation restaurant brandProfile stats bannerImage campaign startDate endDate eventDate eventEndDate codeQuota')
    .populate('restaurant', 'name logo address averageRating totalReviews')
    .populate('brandProfile', 'logo city brandType address')
    .sort({ createdAt: -1 }) // En yeni önce
    .lean(); // JSON object döndür (hızlı)
    
    // Kullanıcının şehir tercihine göre filtrele
    if (userCity) {
      const filteredBanners = eventBanners.filter(banner => {
        // Banner'ın şehir bilgisini kontrol et
        const bannerCity = banner.bannerLocation?.city || 
                          banner.brandProfile?.city || 
                          banner.restaurant?.address?.city;
        
        // Şehir eşleşiyorsa veya şehir bilgisi yoksa göster (şehir bilgisi olmayan banner'ları da göster)
        return !bannerCity || bannerCity === userCity;
      });
      
      console.log(`📍 Şehir filtresi uygulandı (events): ${userCity}`);
      console.log(`   Filtreleme öncesi: ${eventBanners.length} event banner`);
      console.log(`   Filtreleme sonrası: ${filteredBanners.length} event banner`);
      eventBanners = filteredBanners;
    }
    
    console.log('Backend: Found event banners:', eventBanners.length);
    
    // Debug: İlk banner'ın campaign verisini logla
    if (eventBanners.length > 0) {
      console.log('🔍 İlk event banner campaign verisi:', JSON.stringify(eventBanners[0].campaign, null, 2));
    }
    
    res.json({
      success: true,
      data: eventBanners
    });
  } catch (error) {
    console.error('Etkinlik banner\'ları listelenirken hata:', error);
    res.status(500).json({
      success: false,
      message: 'Etkinlik banner\'ları listelenirken hata oluştu!',
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
    const { views, clicks, conversions, userId, deviceInfo, location } = req.body;
    const banner = await Banner.findById(req.params.id).populate('restaurant');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı!'
      });
    }

    // Banner stats'ı güncelle
    const updatedBanner = await Banner.findByIdAndUpdate(
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

    // BannerClick kayıtları oluştur
    try {
      if (views > 0) {
        await BannerClick.create({
          banner: banner._id,
          user: userId || null,
          restaurant: banner.restaurant?._id || null,
          action: 'view',
          deviceInfo: deviceInfo || {},
          location: location || {},
          timestamp: new Date()
        });
      }
      
      if (clicks > 0) {
        await BannerClick.create({
          banner: banner._id,
          user: userId || null,
          restaurant: banner.restaurant?._id || null,
          action: 'click',
          deviceInfo: deviceInfo || {},
          location: location || {},
          timestamp: new Date()
        });
      }
    } catch (clickError) {
      console.error('BannerClick kaydı oluşturulurken hata:', clickError);
      // BannerClick hatası banner stats güncellemesini engellemesin
    }
    
    res.json({
      success: true,
      message: 'Banner istatistikleri güncellendi!',
      data: updatedBanner
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
    const { code, bannerId, billAmount } = req.body;
    
    if (!code || !bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Kod ve banner ID gerekli!'
      });
    }

    // CodeHistory modelini import et
    const CodeHistory = require('../models/CodeHistory');
    
    // bannerId'yi ObjectId'ye çevir
    let bannerObjectId;
    try {
      bannerObjectId = mongoose.Types.ObjectId.isValid(bannerId) ? new mongoose.Types.ObjectId(bannerId) : bannerId;
    } catch (error) {
      console.error('❌ BannerId ObjectId dönüşümü başarısız:', error);
      bannerObjectId = bannerId;
    }
    
    // Kodu ara
    const codeRecord = await CodeHistory.findOne({
      bannerId: bannerObjectId,
      code: code,
      used: false
    }).populate('userId', 'phone name');
    
    // Eğer billAmount geldiyse ve codeRecord varsa billAmount'u güncelle
    if (billAmount && codeRecord) {
      const banner = await Banner.findById(bannerObjectId);
      if (banner && banner.offerType === 'percentage') {
        const discountPercentage = banner.offerDetails?.discountPercentage || 0;
        const originalAmount = parseFloat(billAmount);
        const savedAmount = (originalAmount * discountPercentage) / 100;
        const discountedAmount = originalAmount - savedAmount;
        
        codeRecord.billAmount = {
          originalAmount: originalAmount,
          discountedAmount: Math.round(discountedAmount * 100) / 100,
          savedAmount: Math.round(savedAmount * 100) / 100
        };
        await codeRecord.save();
      }
    }

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
    const banner = await Banner.findById(bannerObjectId);
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
      bannerId: bannerObjectId,
      userId: codeRecord.userId._id,
      phone: codeRecord.userId.phone,
      billAmount: codeRecord.billAmount
    });

    // Sürpriz kutusu ödülünü önce hesapla (response'a eklemek için)
    // NOT: Sürpriz kutusu artık kontrollü açılıyor (%25 şans + günlük limit)
    let surpriseReward = null;
    try {
      const customerUser = await User.findById(codeRecord.userId._id);
      if (customerUser) {
        const { openSurpriseBox } = require('./gamification');
        const surpriseResult = await openSurpriseBox(customerUser._id, null, bannerObjectId);
        if (surpriseResult.success && surpriseResult.canOpen) {
          surpriseReward = surpriseResult.data?.reward || null;
          console.log('🎁 Sürpriz kutusu açıldı ve ödül verildi:', surpriseReward);
        } else {
          console.log('ℹ️ Sürpriz kutusu açılamadı:', surpriseResult.message || 'Şans bu sefer yanınızda değildi');
        }
      }
    } catch (surpriseError) {
      console.error('❌ Sürpriz kutusu hatası:', surpriseError);
      // Hata olsa bile kod doğrulama devam etsin
    }

    // Response'u hemen gönder, bildirim ve istatistikleri arka planda güncelle
    res.json({
      success: true,
      message: 'Kod başarıyla doğrulandı ve indirim uygulandı!',
      data: {
        code: code,
        bannerId: bannerObjectId,
        customerPhone: codeRecord.userId.phone,
        customerName: codeRecord.userId.name,
        usedAt: now,
        billAmount: codeRecord.billAmount,
        offerType: banner.offerType,
        offerDetails: banner.offerDetails,
        surpriseReward: surpriseReward // Frontend için sürpriz kutusu ödülü
      }
    });

    // İstatistikleri ve bildirimi arka planda güncelle (response gönderildikten sonra)
    (async () => {
      try {
        const customerUser = await User.findById(codeRecord.userId._id);
        if (customerUser) {
          // İstatistikleri güncelle
          customerUser.statistics.usedCampaignsCount = (customerUser.statistics.usedCampaignsCount || 0) + 1;
          
          // Eğer savedAmount varsa, totalSavings'i artır
          const billAmount = codeRecord.billAmount;
          if (billAmount && billAmount.savedAmount) {
            customerUser.statistics.totalSavings = (customerUser.statistics.totalSavings || 0) + billAmount.savedAmount;
          }
          
          await customerUser.save();
          console.log('✅ Kullanıcı istatistikleri güncellendi:', {
            userId: customerUser._id,
            usedCampaigns: customerUser.statistics.usedCampaignsCount,
            totalSavings: customerUser.statistics.totalSavings
          });

          // Koleksiyon ilerlemesini güncelle ve sürpriz kutusu aç (arka planda)
          (async () => {
            try {
              if (banner && banner.restaurant) {
                const { updateCollectionProgress } = require('./gamification');
                
                // Şehir bazlı koleksiyonlar
                const city = banner.restaurant.address?.city || banner.restaurant.city || customerUser.city || customerUser.preferences?.city;
                if (city) {
                  const cityCollectionId = `${city.toLowerCase().replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ü', 'u').replace('ö', 'o').replace('ç', 'c')}_best`;
                  await updateCollectionProgress(customerUser._id, cityCollectionId, 1, { city });
                }
                
                // Kategori bazlı koleksiyonlar
                const category = banner.restaurant.category || banner.category;
                if (category) {
                  const categoryMap = {
                    'Kahve': 'coffee_lover',
                    'Restoran': 'restaurant_explorer',
                    'Market': 'market_shopper'
                  };
                  const collectionId = categoryMap[category];
                  if (collectionId) {
                    await updateCollectionProgress(customerUser._id, collectionId, 1, { category });
                  }
                }

              }
            } catch (collectionError) {
              console.error('❌ Koleksiyon güncelleme hatası:', collectionError);
            }
          })();
          
          // OneSignal bildirimi gönder
          if (customerUser.oneSignalExternalId) {
            const message = billAmount 
              ? `Kodunuz doğrulandı! Hesap: ${billAmount.originalAmount} TL, Ödenecek: ${billAmount.discountedAmount} TL`
              : 'Kodunuz başarıyla doğrulandı!';
            
            await OneSignalService.sendToUser(
              customerUser.oneSignalExternalId,
              'Kod Doğrulandı ✅',
              message,
              {
                type: 'code_verified',
                bannerId: bannerObjectId.toString(),
                billAmount: billAmount,
                bannerTitle: banner.title,
                surpriseReward: surpriseReward // Sürpriz kutusu ödülü
              }
            );
            console.log('✅ OneSignal bildirimi gönderildi:', customerUser.phone);
            if (surpriseReward) {
              console.log('🎁 Sürpriz kutusu ödülü bildirime eklendi:', surpriseReward);
            }
          } else {
            console.log('⚠️ Kullanıcı OneSignal ID bulunamadı:', codeRecord.userId.phone);
          }
        }
      } catch (notificationError) {
        console.error('❌ OneSignal bildirim/istatistik hatası:', notificationError);
        // Notification hatası kod doğrulamayı engellemesin
      }
    })();

  } catch (error) {
    console.error('Müşteri kodu doğrulama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Kod doğrulama hatası'
    });
  }
});

// Test bildirimi endpoint'i
router.post('/test-notification', async (req, res) => {
  try {
    console.log('📱 Test bildirimi gönderiliyor...');
    
    const { title, message, data, targetCity, targetCategory } = req.body;
    
    // Varsayılan değerler
    const notificationTitle = title || '🔔 Test Bildirimi';
    const notificationMessage = message || 'OneSignal test bildirimi - Bu mesaj başarıyla geldi!';
    const notificationData = data || { type: 'test', timestamp: new Date().toISOString() };
    
    // OneSignal ile bildirim gönder
    const oneSignalResult = await OneSignalService.sendToAll(
      notificationTitle,
      notificationMessage,
      notificationData,
      targetCity || null,
      targetCategory || null
    );
    
    console.log('✅ OneSignal test bildirimi gönderildi:', oneSignalResult);
    
    res.json({
      success: true,
      message: 'Test bildirimi başarıyla gönderildi',
      oneSignalResult: oneSignalResult,
      sentTo: {
        city: targetCity || 'Tümü',
        category: targetCategory || 'Tümü'
      }
    });
    
  } catch (error) {
    console.error('❌ Test bildirimi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Test bildirimi gönderilemedi',
      error: error.message
    });
  }
});

// Yorum ve puanlama ekleme endpoint'i
router.post('/add-review', async (req, res) => {
  try {
    const { bannerId, userId, userName, rating, comment } = req.body;

    // Validation
    if (!bannerId || !userId || !userName || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Banner ID, User ID, User Name ve Rating zorunludur'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating 1-5 arasında olmalıdır'
      });
    }

    // Banner'ı bul
    const bannerObjectId = mongoose.Types.ObjectId.isValid(bannerId) 
      ? new mongoose.Types.ObjectId(bannerId) 
      : null;
    
    if (!bannerObjectId) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz Banner ID'
      });
    }

    const banner = await Banner.findById(bannerObjectId);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner bulunamadı'
      });
    }

    // Yeni yorum ekle
    banner.reviews.push({
      userId: userId,
      userName: userName,
      rating: rating,
      comment: comment || ''
    });

    await banner.save();

    console.log('✅ Yorum eklendi:', { bannerId, userName, rating });

    res.json({
      success: true,
      message: 'Yorumunuz başarıyla eklendi',
      data: {
        reviews: banner.reviews
      }
    });
  } catch (error) {
    console.error('❌ Yorum ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Yorum eklenirken bir hata oluştu',
      error: error.message
    });
  }
});

module.exports = router; 