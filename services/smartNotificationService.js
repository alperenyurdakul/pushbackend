const cron = require('node-cron');
const User = require('../models/User');
const Menu = require('../models/Menu');
const { sendPushNotification, sendBulkPushNotifications } = require('./pushNotificationService');
const locationService = require('./locationService');

/**
 * Akıllı Bildirim Servisi
 * Kullanıcı tercihlerine göre kişiselleştirilmiş bildirimler gönderir
 */

/**
 * Hafta sonu kontrolü
 */
const isWeekend = () => {
  const day = new Date().getDay();
  return day === 0 || day === 6; // Pazar veya Cumartesi
};

/**
 * Kullanıcı tercihlerine göre restoranları bul
 */
const findRestaurantsForUser = async (user) => {
  try {
    // Kullanıcının tercihlerini al
    const userCity = user.preferences?.city || user.city;
    const userCategories = user.preferences?.categories || [];
    const userLocation = user.latitude && user.longitude ? {
      latitude: user.latitude,
      longitude: user.longitude
    } : null;

    // Varsayılan bütçe ve kişi sayısı (kullanıcı tercihlerinden alınabilir)
    const defaultBudget = 2000;
    const defaultPersonCount = 4;

    // Menüleri getir
    const menus = await Menu.find({
      scrapingStatus: 'success',
      'items.0': { $exists: true }
    }).populate('restaurant', 'name city district latitude longitude category');

    // Filtreleme
    let filteredMenus = menus;

    // Şehir filtresi
    if (userCity) {
      filteredMenus = filteredMenus.filter(menu =>
        menu.restaurant.city === userCity
      );
    }

    // Kategori filtresi
    if (userCategories.length > 0) {
      filteredMenus = filteredMenus.filter(menu =>
        userCategories.includes(menu.restaurant.category)
      );
    }

    // Lokasyon filtresi (10km yarıçap)
    if (userLocation) {
      filteredMenus = filteredMenus.filter(menu => {
        if (!menu.restaurant.latitude || !menu.restaurant.longitude) return false;
        
        const distanceMeters = locationService.calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          menu.restaurant.latitude,
          menu.restaurant.longitude
        );
        
        const distanceKm = distanceMeters / 1000; // Metreyi km'ye çevir
        return distanceKm <= 10; // 10km
      });
    }

    // Bütçe analizi
    const analyzedRestaurants = filteredMenus.map(menu => {
      const avgPricePerPerson = menu.metadata.averagePrice || 0;
      const estimatedTotal = avgPricePerPerson * defaultPersonCount;
      const fitsBudget = estimatedTotal <= defaultBudget;

      return {
        menu,
        restaurant: menu.restaurant,
        estimatedTotal,
        fitsBudget,
        score: fitsBudget ? (100 - (estimatedTotal / defaultBudget * 100)) : 0
      };
    });

    // Bütçeye uygun olanları sırala
    const recommended = analyzedRestaurants
      .filter(r => r.fitsBudget)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // İlk 5 öneri

    return recommended;
  } catch (error) {
    console.error('Restoran bulma hatası:', error);
    return [];
  }
};

/**
 * Kullanıcıya akıllı bildirim gönder
 */
const sendSmartNotification = async (user) => {
  try {
    // Push token kontrolü
    if (!user.pushToken) {
      return { success: false, message: 'Push token yok' };
    }

    // Restoranları bul
    const restaurants = await findRestaurantsForUser(user);

    if (restaurants.length === 0) {
      return { success: false, message: 'Uygun restoran bulunamadı' };
    }

    // Bildirim mesajı oluştur
    const restaurant = restaurants[0].restaurant;
    const estimatedTotal = restaurants[0].estimatedTotal.toFixed(2);
    const personCount = 4; // Varsayılan

    const title = isWeekend() 
      ? 'Hafta Sonu Önerisi 🎉'
      : 'Size Özel Öneri ✨';
    
    const body = `${personCount} kişilik ailen için ${estimatedTotal}₺ bütçe ile ${restaurant.name}'da güzel bir ${restaurant.category || 'yemek'} yapmaya hazır mısınız?`;

    // Bildirim gönder
    const result = await sendPushNotification(
      user,
      title,
      body,
      {
        type: 'price_recommendation',
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        estimatedTotal: estimatedTotal,
        personCount: personCount
      }
    );

    return result;
  } catch (error) {
    console.error('Akıllı bildirim hatası:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Tüm kullanıcılara akıllı bildirim gönder (hafta sonu)
 */
const sendBulkSmartNotifications = async () => {
  try {
    console.log('📱 Toplu akıllı bildirim başlatıldı...');

    // Sadece hafta sonu gönder
    if (!isWeekend()) {
      console.log('ℹ️ Hafta sonu değil, bildirim gönderilmiyor');
      return { success: true, message: 'Hafta sonu değil' };
    }

    // Push token'ı olan müşteri kullanıcılarını getir
    const users = await User.find({
      userType: 'customer',
      pushToken: { $exists: true, $ne: null }
    });

    console.log(`📊 ${users.length} kullanıcı bulundu`);

    const results = {
      success: 0,
      failed: 0,
      skipped: 0
    };

    // Her kullanıcı için ayrı ayrı bildirim gönder (kişiselleştirilmiş)
    for (const user of users) {
      try {
        const result = await sendSmartNotification(user);
        if (result.success) {
          results.success++;
        } else {
          if (result.message === 'Uygun restoran bulunamadı' || result.message === 'Push token yok') {
            results.skipped++;
          } else {
            results.failed++;
          }
        }
      } catch (error) {
        console.error(`❌ Kullanıcı ${user.phone} için bildirim hatası:`, error);
        results.failed++;
      }
    }

    console.log(`✅ Toplu akıllı bildirim tamamlandı: ${results.success} başarılı, ${results.failed} başarısız, ${results.skipped} atlandı`);

    return results;
  } catch (error) {
    console.error('❌ Toplu akıllı bildirim hatası:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Hafta sonu bildirim job'ı başlat
 * Her Cumartesi ve Pazar saat 10:00'da çalışır
 */
const startSmartNotificationJob = () => {
  // Cumartesi ve Pazar saat 10:00
  cron.schedule('0 10 * * 6,0', () => {
    console.log('⏰ Hafta sonu akıllı bildirim zamanı!');
    sendBulkSmartNotifications();
  });

  console.log('✅ Akıllı bildirim job başlatıldı (Hafta sonu 10:00)');
};

module.exports = {
  sendSmartNotification,
  sendBulkSmartNotifications,
  startSmartNotificationJob,
  findRestaurantsForUser
};

