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
        // Fallback: Filtreye uygun kullanıcı bulunamazsa, tüm pushToken'ı olan kullanıcılara gönder
        console.log('💡 Fallback: Tüm pushToken\'ı olan kullanıcılara gönderiliyor...');
        const allUsers = await User.find(
          { pushToken: { $exists: true, $ne: null } },
          { pushToken: 1, pushPlatform: 1, pushTokenType: 1, name: 1, phone: 1 }
        );
        
        if (allUsers.length === 0) {
          console.log('⚠️ Hiç pushToken\'ı olan kullanıcı yok!');
          continue;
        }
        
        console.log(`📤 ${allUsers.length} kullanıcıya bildirim gönderiliyor (fallback)...`);
        
        // Toplu push gönder
        const result = await sendBulkPushNotifications(
          allUsers,
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
 * AND mantığı: Hem şehir hem kategori eşleşmeli (ikisi de varsa)
 */
const getFilteredUsers = async (filters = {}) => {
  try {
    const query = {
      pushToken: { $exists: true, $ne: null } // Push token'ı olan kullanıcılar
    };

    // Şehir filtresi (case-insensitive)
    const cityConditions = [];
    if (filters.city && filters.city.trim() !== '') {
      const cityRegex = new RegExp(filters.city.trim(), 'i');
      cityConditions.push(
        { city: cityRegex },
        { 'preferences.city': cityRegex }
      );
    }

    // Kategori filtresi
    const categoryConditions = [];
    if (filters.categories && filters.categories.length > 0) {
      const categoryArray = Array.isArray(filters.categories) ? filters.categories : [filters.categories];
      categoryConditions.push(
        { category: { $in: categoryArray } },
        { 'preferences.categories': { $in: categoryArray } }
      );
    }

    // AND mantığı: Hem şehir hem kategori eşleşmeli (ikisi de varsa)
    const andConditions = [];
    
    if (cityConditions.length > 0) {
      andConditions.push({ $or: cityConditions });
    }
    
    if (categoryConditions.length > 0) {
      andConditions.push({ $or: categoryConditions });
    }

    // Eğer hem şehir hem kategori filtresi varsa, $and kullan
    if (andConditions.length > 1) {
      query.$and = andConditions;
      console.log('🔍 Filtreleme mantığı: ŞEHİR VE KATEGORİ (AND)');
    } else if (andConditions.length === 1) {
      // Sadece şehir VEYA sadece kategori filtresi varsa
      query.$or = andConditions[0].$or;
      console.log('🔍 Filtreleme mantığı: Sadece şehir VEYA kategori (OR)');
    }

    console.log('🔍 Kullanıcı filtreleme query:', JSON.stringify(query, null, 2));
    console.log(`📋 Filtreler: Şehir=${filters.city || 'Yok'}, Kategoriler=${filters.categories?.join(', ') || 'Yok'}`);

    const users = await User.find(query, {
      pushToken: 1,
      pushPlatform: 1,
      pushTokenType: 1,
      name: 1,
      phone: 1,
      city: 1,
      'preferences.city': 1,
      'preferences.categories': 1
    });

    console.log(`📊 Filtreleme sonucu: ${users.length} kullanıcı bulundu`);
    
    // Bulunan kullanıcıların detaylarını göster (debug için)
    if (users.length > 0 && users.length <= 5) {
      users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.name} - Şehir: ${user.city || user.preferences?.city || 'Yok'}, Kategoriler: ${user.preferences?.categories?.join(', ') || 'Yok'}`);
      });
    }

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
