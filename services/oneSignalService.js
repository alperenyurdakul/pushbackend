const OneSignal = require('onesignal-node');

// OneSignal yapılandırması
const client = new OneSignal.Client({
  userAuthKey: process.env.ONESIGNAL_USER_AUTH_KEY || 'os_v2_app_xv6pexjxm5ahlkcnh6jtfw4uaysjwjo7rmlen35t2y2jnizajtbfvvbm27o2mdmbq2l5nsx7khz7an3xzmx35hbupuoydek2wwa7ykq', // OneSignal User Auth Key
  app: {
    appAuthKey: process.env.ONESIGNAL_APP_AUTH_KEY || 'os_v2_app_xv6pexjxm5ahlkcnh6jtfw4uaysjwjo7rmlen35t2y2jnizajtbfvvbm27o2mdmbq2l5nsx7khz7an3xzmx35hbupuoydek2wwa7ykq',  // OneSignal App Auth Key
    appId: process.env.ONESIGNAL_APP_ID || 'bd7cf25d-3767-4075-a84d-3f9332db9406'              // OneSignal App ID
  }
});

class OneSignalService {
  
  // Tek kullanıcıya bildirim gönder
  static async sendToUser(externalUserId, title, message, data = {}) {
    try {
      const notification = {
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        include_external_user_ids: [externalUserId],
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      };

      const response = await client.createNotification(notification);
      console.log('OneSignal bildirim gönderildi:', response.body);
      return response.body;
    } catch (error) {
      console.error('OneSignal bildirim gönderme hatası:', error);
      throw error;
    }
  }

  // Birden fazla kullanıcıya bildirim gönder
  static async sendToUsers(externalUserIds, title, message, data = {}) {
    try {
      const notification = {
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        include_external_user_ids: externalUserIds,
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      };

      const response = await client.createNotification(notification);
      console.log('OneSignal toplu bildirim gönderildi:', response.body);
      return response.body;
    } catch (error) {
      console.error('OneSignal toplu bildirim gönderme hatası:', error);
      throw error;
    }
  }

  // Tüm kullanıcılara bildirim gönder
  static async sendToAll(title, message, data = {}) {
    try {
      const notification = {
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        included_segments: ['All'],
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      };

      const response = await client.createNotification(notification);
      console.log('OneSignal genel bildirim gönderildi:', response.body);
      return response.body;
    } catch (error) {
      console.error('OneSignal genel bildirim gönderme hatası:', error);
      throw error;
    }
  }

  // Filtreli kullanıcılara bildirim gönder (etiketlere göre)
  static async sendToSegment(filters, title, message, data = {}) {
    try {
      const notification = new OneSignal.Notification({
        headings: { en: title, tr: title },
        contents: { en: message, tr: message },
        filters: filters,
        data: data,
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: 'default'
      });

      const response = await client.sendNotification(notification);
      console.log('OneSignal segment bildirim gönderildi:', response.body);
      return response.body;
    } catch (error) {
      console.error('OneSignal segment bildirim gönderme hatası:', error);
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
      const notification = new OneSignal.Notification({
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
      });

      const response = await client.sendNotification(notification);
      console.log('OneSignal konum-bazlı bildirim gönderildi:', response.body);
      return response.body;
    } catch (error) {
      console.error('OneSignal konum-bazlı bildirim gönderme hatası:', error);
      throw error;
    }
  }

  // Bildirim geçmişini al
  static async getNotificationHistory(limit = 50, offset = 0) {
    try {
      const response = await client.viewNotifications({
        limit: limit,
        offset: offset
      });
      console.log('OneSignal bildirim geçmişi alındı');
      return response.body;
    } catch (error) {
      console.error('OneSignal bildirim geçmişi alma hatası:', error);
      throw error;
    }
  }

  // Tek bir bildirimin durumunu kontrol et
  static async getNotificationStatus(notificationId) {
    try {
      const response = await client.viewNotification(notificationId);
      console.log('OneSignal bildirim durumu alındı:', notificationId);
      return response.body;
    } catch (error) {
      console.error('OneSignal bildirim durumu alma hatası:', error);
      throw error;
    }
  }

  // Uygulama istatistiklerini al
  static async getAppStats() {
    try {
      const response = await client.viewApps();
      console.log('OneSignal uygulama istatistikleri alındı');
      return response.body;
    } catch (error) {
      console.error('OneSignal uygulama istatistikleri alma hatası:', error);
      throw error;
    }
  }

  // Kullanıcı segmentlerini al
  static async getSegments() {
    try {
      const response = await client.viewSegments();
      console.log('OneSignal segmentler alındı');
      return response.body;
    } catch (error) {
      console.error('OneSignal segment alma hatası:', error);
      throw error;
    }
  }
}

module.exports = OneSignalService;
