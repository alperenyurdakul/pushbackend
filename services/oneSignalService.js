const axios = require('axios');

// OneSignal yapılandırması
console.log('OneSignal Config:', {
  appId: process.env.ONESIGNAL_APP_ID,
  appIdLength: process.env.ONESIGNAL_APP_ID ? process.env.ONESIGNAL_APP_ID.length : 0,
  appAuthKey: process.env.ONESIGNAL_APP_AUTH_KEY ? 'Set' : 'Not set',
});

// OneSignal App ID format kontrolü
const appId = process.env.ONESIGNAL_APP_ID;
if (!appId || appId.length !== 36) {
  console.error('OneSignal App ID format hatası! UUID formatında olmalı (36 karakter)');
  console.error('Mevcut App ID:', appId);
}

class OneSignalService {
  
         // Tek kullanıcıya bildirim gönder
         static async sendToUser(externalUserId, title, message, data = {}, silent = false) {
           try {
             const notification = {
               app_id: process.env.ONESIGNAL_APP_ID,
               headings: { en: title, tr: title },
               contents: { en: message, tr: message },
               include_external_user_ids: [externalUserId],
               data: data
             };
             
             // Silent notification (arka plan data push)
             if (silent) {
               notification.content_available = true;
               notification.mutable_content = true;
               notification.ios_sound = "";
               notification.android_sound = null;
             }

      const response = await axios.post('https://api.onesignal.com/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      
      console.log('OneSignal bildirim gönderildi:', response.data);
      return response.data;
    } catch (error) {
      console.error('OneSignal bildirim gönderme hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

         // Birden fazla kullanıcıya bildirim gönder
         static async sendToUsers(externalUserIds, title, message, data = {}) {
           try {
             const notification = {
               app_id: process.env.ONESIGNAL_APP_ID,
               headings: { en: title, tr: title },
               contents: { en: message, tr: message },
               include_external_user_ids: externalUserIds,
               data: data
             };

      const response = await axios.post('https://api.onesignal.com/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      
      console.log('OneSignal toplu bildirim gönderildi:', response.data);
      return response.data;
    } catch (error) {
      console.error('OneSignal toplu bildirim gönderme hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

         // Tüm kullanıcılara bildirim gönder (FİLTRELİ)
         static async sendToAll(title, message, data = {}, bannerCity = null, bannerCategory = null) {
           try {
             console.log('=== OneSignal Bağlantı Testi ===');
             console.log('App ID:', process.env.ONESIGNAL_APP_ID);
             console.log('App Auth Key:', process.env.ONESIGNAL_APP_AUTH_KEY ? process.env.ONESIGNAL_APP_AUTH_KEY.substring(0, 30) + '...' : 'Not set');
             
             // Filtrelenmiş kullanıcıları bul
             const User = require('../models/User');
             const query = {
               userType: 'customer',
               oneSignalExternalId: { $exists: true, $ne: null }
             };
             
             // Şehir filtresi - normalize edilmiş şehir adı ile case-insensitive eşleşme
             if (bannerCity) {
               const normalizedCity = bannerCity.trim();
               // Case-insensitive eşleşme için regex kullan
               query['preferences.city'] = { 
                 $regex: new RegExp(`^${normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
               };
               // Şehir tercihi olmayan kullanıcıları da dahil et
               query['$or'] = [
                 { 'preferences.city': { $regex: new RegExp(`^${normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
                 { 'preferences.city': { $exists: false } },
                 { 'preferences.city': null }
               ];
               delete query['preferences.city'];
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
                 const normalizedCity = bannerCity.trim();
                 query['$and'] = [
                   { 
                     '$or': [
                       { 'preferences.city': { $regex: new RegExp(`^${normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
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
             
             console.log('🔍 OneSignal filtresi:', {
               bannerCity,
               bannerCategory,
               query: JSON.stringify(query, null, 2)
             });
             
             const users = await User.find(query);
             
             if (users.length === 0) {
               console.log('❌ OneSignal: Bildirim gönderilecek kullanıcı bulunamadı (filtre uygulandı)');
               return { success: false, message: 'No filtered users found' };
             }
             
             const externalUserIds = users
               .map(user => user.oneSignalExternalId)
               .filter(id => id && id.trim() !== '');
             
             if (externalUserIds.length === 0) {
               console.log('❌ OneSignal: Geçerli external user ID bulunamadı');
               return { success: false, message: 'No valid external IDs' };
             }
             
             console.log(`📱 OneSignal: ${externalUserIds.length} kullanıcıya bildirim gönderiliyor`);
             console.log(`📍 Şehir filtresi: ${bannerCity || 'Yok'}`);
             console.log(`🏷️ Kategori filtresi: ${bannerCategory || 'Yok'}`);
             
             const notification = {
               app_id: process.env.ONESIGNAL_APP_ID,
               headings: { en: title, tr: title },
               contents: { en: message, tr: message },
               include_external_user_ids: externalUserIds,
               data: data
             };

      console.log('OneSignal notification payload:', JSON.stringify(notification, null, 2));
      console.log('OneSignal API URL:', 'https://api.onesignal.com/notifications');
      console.log('Authorization header:', `key ${process.env.ONESIGNAL_APP_AUTH_KEY}`);

      const response = await axios.post('https://api.onesignal.com/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      
      console.log('✅ OneSignal genel bildirim gönderildi:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ OneSignal genel bildirim gönderme hatası:', error.response ? error.response.data : error.message);
      console.error('Error status:', error.response ? error.response.status : 'No status');
      console.error('Error headers:', error.response ? error.response.headers : 'No headers');
      throw error;
    }
  }

  // Filtreli kullanıcılara bildirim gönder (etiketlere göre)
  static async sendToSegment(filters, title, message, data = {}) {
    try {
      const notification = {
        app_id: process.env.ONESIGNAL_APP_ID,
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        filters: filters,
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      };

      const response = await axios.post('https://api.onesignal.com/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      
      console.log('OneSignal segment bildirim gönderildi:', response.data);
      return response.data;
    } catch (error) {
      console.error('OneSignal segment bildirim gönderme hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Yeni banner bildirimi
  static async sendNewBannerNotification(banner, targetUsers = null) {
    const title = 'Hadi İndirimi Kap';
    const message = `${banner.restaurant?.name || 'Restoran'} - ${banner.title}`;
    const data = {
      type: 'new_banner',
      bannerId: banner._id,
      restaurantId: banner.restaurant?._id,
      restaurantName: banner.restaurant?.name
    };

    console.log('OneSignalService.sendNewBannerNotification çağrıldı:', {
      title,
      message,
      data,
      targetUsers
    });

    if (targetUsers && targetUsers.length > 0) {
      // Belirli kullanıcılara gönder
      console.log('Belirli kullanıcılara gönderiliyor:', targetUsers);
      return await this.sendToUsers(targetUsers, title, message, data);
    } else {
      // Tüm kullanıcılara gönder
      console.log('Tüm kullanıcılara gönderiliyor');
      return await this.sendToAll(title, message, data);
    }
  }

  // Kampanya hatırlatması
  static async sendBannerReminderNotification(banner, externalUserId) {
    const title = '⏰ Kampanya Hatırlatması';
    const message = `${banner.title} - ${banner.restaurant?.name || 'Restoran'}`;
    const data = {
      type: 'banner_reminder',
      bannerId: banner._id,
      restaurantId: banner.restaurant?._id
    };

    return await this.sendToUser(externalUserId, title, message, data);
  }

  // Restoran sahibine bildirim
  static async sendToRestaurantOwner(restaurantOwnerId, title, message, data = {}) {
    const enhancedData = {
      ...data,
      type: 'restaurant_notification',
      targetType: 'restaurant_owner'
    };

    return await this.sendToUser(restaurantOwnerId, title, message, enhancedData);
  }

  // Belirli konumdaki kullanıcılara bildirim (gelecekte geliştirilebilir)
  static async sendToLocation(latitude, longitude, radius, title, message, data = {}) {
    try {
      const notification = {
        app_id: process.env.ONESIGNAL_APP_ID,
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        filters: [
          {
            field: 'location',
            radius: radius,
            lat: latitude,
            long: longitude
          }
        ],
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      };

      const response = await axios.post('https://api.onesignal.com/notifications', notification, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      
      console.log('OneSignal konum-bazlı bildirim gönderildi:', response.data);
      return response.data;
    } catch (error) {
      console.error('OneSignal konum-bazlı bildirim gönderme hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Bildirim geçmişini al
  static async getNotificationHistory(limit = 50, offset = 0) {
    try {
      const response = await axios.get(`https://api.onesignal.com/notifications?app_id=${process.env.ONESIGNAL_APP_ID}&limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      console.log('OneSignal bildirim geçmişi alındı');
      return response.data;
    } catch (error) {
      console.error('OneSignal bildirim geçmişi alma hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Tek bir bildirimin durumunu kontrol et
  static async getNotificationStatus(notificationId) {
    try {
      const response = await axios.get(`https://api.onesignal.com/notifications/${notificationId}?app_id=${process.env.ONESIGNAL_APP_ID}`, {
        headers: {
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      console.log('OneSignal bildirim durumu alındı:', notificationId);
      return response.data;
    } catch (error) {
      console.error('OneSignal bildirim durumu alma hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Uygulama istatistiklerini al
  static async getAppStats() {
    try {
      const response = await axios.get(`https://api.onesignal.com/apps/${process.env.ONESIGNAL_APP_ID}`, {
        headers: {
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      console.log('OneSignal uygulama istatistikleri alındı');
      return response.data;
    } catch (error) {
      console.error('OneSignal uygulama istatistikleri alma hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Kullanıcı segmentlerini al
  static async getSegments() {
    try {
      const response = await axios.get(`https://api.onesignal.com/apps/${process.env.ONESIGNAL_APP_ID}/segments`, {
        headers: {
          'Authorization': `Key ${process.env.ONESIGNAL_APP_AUTH_KEY}`
        }
      });
      console.log('OneSignal segmentler alındı');
      return response.data;
    } catch (error) {
      console.error('OneSignal segment alma hatası:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  // Yeni banner bildirimi gönder
  static async sendNewBannerNotification(banner) {
    try {
      console.log('=== Yeni Banner OneSignal Bildirimi ===');
      console.log('Banner ID:', banner._id);
      console.log('Banner Title:', banner.title);
      console.log('Restaurant:', banner.restaurant?.name);
      
      const title = '🎉 Yeni Kampanya!';
      const message = `${banner.restaurant?.name || 'Restoran'} - ${banner.title}`;
      
      const result = await this.sendToAll(title, message, {
        type: 'new_banner',
        bannerId: banner._id.toString(),
        restaurantName: banner.restaurant?.name,
        timestamp: new Date().toISOString()
      });
      
      console.log('✅ Yeni banner bildirimi gönderildi:', result);
      return result;
    } catch (error) {
      console.error('❌ Yeni banner bildirimi gönderilemedi:', error);
      throw error;
    }
  }
}

module.exports = OneSignalService;