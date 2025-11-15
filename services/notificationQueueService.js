const cron = require('node-cron');
const { sendPushNotification, sendBulkPushNotifications } = require('./pushNotificationService');
const User = require('../models/User');
const Banner = require('../models/Banner');

// Batch toplama için geçici depolama
let batchNotifications = [];

/**
 * Bildirim event'ini queue'ya ekle (15 dakika batch için)
 */
const addNotificationToBatch = (notification) => {
  try {
    const event = {
      type: notification.type, // 'campaign', 'event', 'event_participation', etc.
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      filters: notification.filters || {}, // { city, categories, etc. }
      timestamp: Date.now()
    };

    batchNotifications.push(event);
    console.log(`📦 Bildirim batch'e eklendi: ${notification.type} (Toplam: ${batchNotifications.length})`);

    return true;
  } catch (error) {
    console.error('❌ Batch ekleme hatası:', error);
    return false;
  }
};

/**
 * Batch'i işle ve bildirimleri gönder
 */
const processBatch = async () => {
  try {
    if (batchNotifications.length === 0) {
      console.log('📦 Batch boş, işlenecek bir şey yok');
      return;
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 BATCH İŞLEMİ BAŞLADI: ${batchNotifications.length} bildirim`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Bildirimleri tipe göre grupla
    const groupedNotifications = groupNotificationsByType(batchNotifications);

    // Her grup için işle
    for (const [type, notifications] of Object.entries(groupedNotifications)) {
      await processNotificationGroup(type, notifications);
    }

    // Batch'i temizle
    batchNotifications = [];
    console.log(`✅ Batch işlendi ve temizlendi`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  } catch (error) {
    console.error('❌ Batch işleme hatası:', error);
  }
};

/**
 * Bildirimleri tipe göre grupla
 */
const groupNotificationsByType = (notifications) => {
  const grouped = {};

  for (const notification of notifications) {
    const key = notification.type || 'general';
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(notification);
  }

  return grouped;
};

/**
 * Bildirim grubunu işle (segmentasyon + toplu gönderim)
 */
const processNotificationGroup = async (type, notifications) => {
  try {
    console.log(`\n📋 ${type} tipinde ${notifications.length} bildirim işleniyor...`);

    // Son 15 dakikadaki benzer bildirimleri birleştir
    const aggregated = aggregateNotifications(notifications);

    for (const notification of aggregated) {
      // Kullanıcı segmentasyonu
      const users = await getFilteredUsers(notification.filters);

      if (users.length === 0) {
        console.log(`⚠️ ${type} için filtreye uygun kullanıcı bulunamadı`);
        continue;
      }

      console.log(`📤 ${users.length} kullanıcıya bildirim gönderiliyor...`);

      // Toplu push gönder
      const result = await sendBulkPushNotifications(
        users,
        notification.title,
        notification.body,
        notification.data
      );

      console.log(`✅ ${result.success} başarılı, ${result.failed} başarısız`);
      
      // Geçersiz tokenları temizle
      if (result.invalidTokens.length > 0) {
        await cleanupInvalidTokens(result.invalidTokens);
        console.log(`🧹 ${result.invalidTokens.length} geçersiz token temizlendi`);
      }
    }
  } catch (error) {
    console.error(`❌ ${type} grup işleme hatası:`, error);
  }
};

/**
 * Benzer bildirimleri birleştir (örn: aynı markadan 8 kampanya = 1 bildirim)
 */
const aggregateNotifications = (notifications) => {
  const aggregated = [];

  // Tipe göre grupla
  const byType = {};
  for (const notification of notifications) {
    const key = notification.type;
    if (!byType[key]) {
      byType[key] = [];
    }
    byType[key].push(notification);
  }

  // Her grup için birleştirme yap
  for (const [type, group] of Object.entries(byType)) {
    if (type === 'campaign' && group.length > 1) {
      // Kampanyaları birleştir
      const city = group[0].filters?.city || 'Yakınında';
      const count = group.length;
      
      aggregated.push({
        type: 'campaign_batch',
        title: `📍 ${city}'de ${count} Yeni Fırsat!`,
        body: `Yakınında ${count} yeni kampanya var, göz at!`,
        data: {
          type: 'campaign_batch',
          count: count,
          city: city,
          timestamp: Date.now()
        },
        filters: group[0].filters
      });
    } else if (type === 'event' && group.length > 1) {
      // Etkinlikleri birleştir
      const city = group[0].filters?.city || 'Yakınında';
      const count = group.length;
      
      aggregated.push({
        type: 'event_batch',
        title: `🎉 ${city}'de ${count} Yeni Etkinlik!`,
        body: `Yakınında ${count} yeni etkinlik var, keşfet!`,
        data: {
          type: 'event_batch',
          count: count,
          city: city,
          timestamp: Date.now()
        },
        filters: group[0].filters
      });
    } else {
      // Tek bildirimleri olduğu gibi ekle
      aggregated.push(...group);
    }
  }

  return aggregated;
};

/**
 * Segmentasyon filtresine göre kullanıcıları getir
 */
const getFilteredUsers = async (filters = {}) => {
  try {
    const query = {
      pushToken: { $exists: true, $ne: null } // Push token'ı olan kullanıcılar
    };

    // Şehir filtresi
    if (filters.city) {
      query.$or = [
        { city: filters.city },
        { 'preferences.city': filters.city }
      ];
    }

    // Kategori filtresi
    if (filters.categories && filters.categories.length > 0) {
      if (!query.$or) query.$or = [];
      query.$or.push(
        { category: { $in: filters.categories } },
        { 'preferences.categories': { $in: filters.categories } }
      );
    }

    // Aktif kullanıcılar (son 30 gün içinde login olanlar - opsiyonel)
    // query.lastLoginAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };

    const users = await User.find(query, {
      pushToken: 1,
      pushPlatform: 1,
      pushTokenType: 1,
      name: 1,
      phone: 1
    });

    return users;
  } catch (error) {
    console.error('❌ Kullanıcı filtreleme hatası:', error);
    return [];
  }
};

/**
 * Geçersiz tokenları temizle
 */
const cleanupInvalidTokens = async (userIds) => {
  try {
    await User.updateMany(
      { _id: { $in: userIds } },
      {
        $unset: {
          pushToken: '',
          pushPlatform: '',
          pushTokenType: ''
        }
      }
    );
  } catch (error) {
    console.error('❌ Token temizleme hatası:', error);
  }
};

/**
 * 15 dakikalık batch job'ı başlat
 */
const startBatchJob = () => {
  // Her 15 dakikada bir batch'i işle
  cron.schedule('*/15 * * * *', () => {
    console.log('⏰ 15 dakika doldu, batch işleniyor...');
    processBatch();
  });

  // İlk açılışta da çalıştır (opsiyonel)
  // processBatch();

  console.log('✅ Batch job başlatıldı (15 dakika)');
};

/**
 * Batch'i temizle ve kapat
 */
const shutdown = async () => {
  try {
    // Bekleyen batch'i işle
    if (batchNotifications.length > 0) {
      console.log('🔄 Kapanmadan önce bekleyen batch işleniyor...');
      await processBatch();
    }
    
    console.log('✅ Notification batch sistemi kapatıldı');
  } catch (error) {
    console.error('❌ Batch kapatma hatası:', error);
  }
};

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * Test için manuel batch tetikleme
 */
const triggerBatchManually = async () => {
  console.log('🧪 TEST: Batch manuel olarak tetikleniyor...');
  await processBatch();
};

module.exports = {
  addNotificationToBatch,
  processBatch,
  startBatchJob,
  shutdown,
  triggerBatchManually
};

