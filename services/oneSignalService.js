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
         static async sendToUser(externalUserId, title, message, data = {}) {
           try {
             const notification = {
               app_id: process.env.ONESIGNAL_APP_ID,
               headings: { en: title, tr: title },
               contents: { en: message, tr: message },
               include_external_user_ids: [externalUserId],
               data: data
             };

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

         // Tüm kullanıcılara bildirim gönder
         static async sendToAll(title, message, data = {}) {
           try {
             console.log('=== OneSignal Bağlantı Testi ===');
             console.log('App ID:', process.env.ONESIGNAL_APP_ID);
             console.log('App Auth Key:', process.env.ONESIGNAL_APP_AUTH_KEY ? process.env.ONESIGNAL_APP_AUTH_KEY.substring(0, 30) + '...' : 'Not set');
             
             const notification = {
               app_id: process.env.ONESIGNAL_APP_ID,
               headings: { en: title, tr: title },
               contents: { en: message, tr: message },
               included_segments: ['All'],
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
}

module.exports = OneSignalService;