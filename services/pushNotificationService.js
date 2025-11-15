const admin = require('firebase-admin');
// APN paketini opsiyonel yap (kurulmamışsa devre dışı)
let apn = null;
try {
  apn = require('apn');
} catch (error) {
  console.log('⚠️ APN paketi kurulu değil, iOS bildirimleri devre dışı');
}

// Firebase Admin SDK başlatma (config gerekli)
let fcmInitialized = false;

/**
 * Firebase Admin SDK'yı başlat
 * TODO: Firebase service account key dosyası gerekli
 */
const initializeFCM = () => {
  if (fcmInitialized) {
    return true;
  }

  try {
    // Firebase Admin SDK initialization
    // Service account key dosyası gerekli: firebase-service-account.json
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      fcmInitialized = true;
      console.log('✅ Firebase Admin SDK başlatıldı (FCM)');
      console.log(`📱 Firebase Project ID: ${serviceAccount.project_id || 'N/A'}`);
      return true;
    } else {
      console.log('⚠️ Firebase service account key bulunamadı, FCM devre dışı');
      console.log('💡 .env dosyasında FIREBASE_SERVICE_ACCOUNT_KEY kontrol et');
      return false;
    }
  } catch (error) {
    console.error('❌ Firebase Admin SDK başlatma hatası:', error);
    console.error('❌ Hata detayları:', error.message);
    if (error.message && error.message.includes('JSON')) {
      console.error('💡 FIREBASE_SERVICE_ACCOUNT_KEY geçersiz JSON olabilir');
    }
    return false;
  }
};

// APNs başlatma
let apnsProvider = null;

/**
 * APNs Provider'ı başlat
 * TODO: APNs certificate/key dosyaları gerekli
 */
const initializeAPNs = () => {
  if (apnsProvider) {
    return true;
  }

  // APN paketi yoksa devre dışı
  if (!apn) {
    console.log('⚠️ APN paketi kurulu değil, APNs devre dışı');
    return false;
  }

  try {
    // APNs certificate veya key-based auth
    // Debug: Environment variables kontrolü
    console.log('🔍 APNs credentials kontrolü:');
    console.log(`  APNS_KEY_ID: ${process.env.APNS_KEY_ID ? '✅ Var' : '❌ Yok'}`);
    console.log(`  APNS_TEAM_ID: ${process.env.APNS_TEAM_ID ? '✅ Var' : '❌ Yok'}`);
    console.log(`  APNS_KEY_BASE64: ${process.env.APNS_KEY_BASE64 ? '✅ Var (' + process.env.APNS_KEY_BASE64.substring(0, 30) + '...)' : '❌ Yok'}`);
    console.log(`  APNS_KEY: ${process.env.APNS_KEY ? '✅ Var' : '❌ Yok'}`);
    console.log(`  APNS_PRODUCTION: ${process.env.APNS_PRODUCTION || 'false'}`);
    
    if (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID) {
      let apnsKey = null;
      
      // ÖNCELİK: APNS_KEY_BASE64 kullan (base64 encode edilmişse)
      if (process.env.APNS_KEY_BASE64) {
        try {
          apnsKey = Buffer.from(process.env.APNS_KEY_BASE64, 'base64').toString('utf-8');
          console.log('📝 APNs key base64\'den decode edildi');
        } catch (base64Error) {
          console.error('❌ APNs key base64 decode hatası:', base64Error.message);
          return false;
        }
      } else if (process.env.APNS_KEY) {
        // APNS_KEY kullan (normal format - \n ile)
        apnsKey = process.env.APNS_KEY;
        
        // Base64 string gibi görünüyorsa (LS0t ile başlıyorsa), decode et
        if (apnsKey.trim().startsWith('LS0t') && apnsKey.length > 100) {
          try {
            console.log('📝 APNS_KEY base64 string olarak algılandı, decode ediliyor...');
            apnsKey = Buffer.from(apnsKey.trim(), 'base64').toString('utf-8');
            console.log('📝 APNs key base64\'den decode edildi');
          } catch (base64Error) {
            console.log('💡 APNS_KEY base64 değil, normal format olarak kullanılıyor');
          }
        }
        
        // \n karakterlerini gerçek newline'lara çevir
        apnsKey = apnsKey.replace(/\\n/g, '\n');
      } else {
        console.error('❌ APNS_KEY veya APNS_KEY_BASE64 bulunamadı');
        console.error('💡 .env dosyasında APNS_KEY_BASE64 veya APNS_KEY kontrol et');
        return false;
      }
      
      // Key'i temizle: Başındaki/sonundaki whitespace'leri ve gereksiz karakterleri temizle
      apnsKey = apnsKey.trim();
      
      // Key formatını kontrol et ve düzelt
      if (!apnsKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        console.error('❌ APNs key format hatası: BEGIN PRIVATE KEY bulunamadı');
        console.log(`💡 Key başlangıcı: ${apnsKey.substring(0, 50)}...`);
        console.log('💡 Key şöyle başlamalı: -----BEGIN PRIVATE KEY-----');
        return false;
      }
      
      if (!apnsKey.endsWith('-----END PRIVATE KEY-----')) {
        // Sonundaki gereksiz karakterleri temizle
        apnsKey = apnsKey.replace(/\n+$/, '');
        apnsKey = apnsKey.replace(/\/+$/, ''); // Sonundaki / karakterlerini temizle
        if (!apnsKey.endsWith('-----END PRIVATE KEY-----')) {
          apnsKey = apnsKey + '\n-----END PRIVATE KEY-----';
        }
      }
      
      // Key'i normalize et: Her satırın sonunda newline olsun
      const keyLines = apnsKey.split('\n');
      const normalizedKey = keyLines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n') + '\n';
      
      console.log(`📝 APNs key parse edildi (${normalizedKey.split('\n').length} satır)`);
      console.log(`📝 Key başlangıcı: ${normalizedKey.substring(0, 50)}...`);
      console.log(`📝 Key ID: ${process.env.APNS_KEY_ID}, Team ID: ${process.env.APNS_TEAM_ID}`);
      
      // Key-based authentication (önerilen)
      // NOT: apn paketi key'i string olarak alır (dosya yolu değil)
      apnsProvider = new apn.Provider({
        token: {
          key: normalizedKey, // String olarak geçir (dosya yolu değil)
          keyId: process.env.APNS_KEY_ID,
          teamId: process.env.APNS_TEAM_ID
        },
        production: process.env.APNS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production'
      });

      console.log('✅ APNs Provider başlatıldı (Key-based)');
      return true;
    } else {
      console.error('❌ APNs credentials eksik:');
      if (!process.env.APNS_KEY_ID) {
        console.error('  - APNS_KEY_ID eksik');
      }
      if (!process.env.APNS_TEAM_ID) {
        console.error('  - APNS_TEAM_ID eksik');
      }
      if (!process.env.APNS_KEY_BASE64 && !process.env.APNS_KEY) {
        console.error('  - APNS_KEY_BASE64 veya APNS_KEY eksik');
      }
      console.log('⚠️ APNs credentials bulunamadı, APNs devre dışı');
      return false;
    }
    
    // Certificate-based authentication (eski yöntem - artık kullanılmıyor)
    if (false && process.env.APNS_CERT_PATH && process.env.APNS_KEY_PATH) {
      // Certificate-based authentication (eski yöntem)
      apnsProvider = new apn.Provider({
        cert: process.env.APNS_CERT_PATH,
        key: process.env.APNS_KEY_PATH,
        production: process.env.APNS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production'
      });

      console.log('✅ APNs Provider başlatıldı (Certificate-based)');
      return true;
    } else {
      console.log('⚠️ APNs credentials bulunamadı, APNs devre dışı');
      return false;
    }
  } catch (error) {
    console.error('❌ APNs Provider başlatma hatası:', error);
    return false;
  }
};

/**
 * Tek kullanıcıya push gönder (FCM/APNs)
 */
const sendPushNotification = async (user, title, body, data = {}) => {
  try {
    if (!user.pushToken) {
      console.log(`⚠️ ${user.name || user.phone} - Push token yok`);
      return { success: false, message: 'Push token yok' };
    }

    const platform = user.pushPlatform;
    const token = user.pushToken;

    if (platform === 'android' || user.pushTokenType === 'fcm') {
      // FCM (Android)
      return await sendFCMNotification(token, title, body, data);
    } else if (platform === 'ios' || user.pushTokenType === 'apns') {
      // APNs (iOS)
      return await sendAPNsNotification(token, title, body, data);
    } else {
      console.log(`⚠️ Bilinmeyen platform: ${platform}`);
      return { success: false, message: 'Bilinmeyen platform' };
    }
  } catch (error) {
    console.error('❌ Push gönderme hatası:', error);
    return { success: false, message: error.message };
  }
};

/**
 * FCM bildirimi gönder (Android)
 */
const sendFCMNotification = async (token, title, body, data = {}) => {
  if (!fcmInitialized) {
    if (!initializeFCM()) {
      return { success: false, message: 'FCM başlatılamadı' };
    }
  }

  try {
    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        // String'e çevir (FCM data alanları string olmalı)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {})
      },
      token: token
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ FCM bildirimi gönderildi: ${response}`);

    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ FCM gönderme hatası:', error);

    // Invalid token kontrolü
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      return { success: false, message: 'Invalid token', shouldRemoveToken: true };
    }

    return { success: false, message: error.message };
  }
};

/**
 * APNs bildirimi gönder (iOS)
 */
const sendAPNsNotification = async (token, title, body, data = {}) => {
  if (!apnsProvider) {
    if (!initializeAPNs()) {
      return { success: false, message: 'APNs başlatılamadı' };
    }
  }

  try {
    const notification = new apn.Notification();

    notification.alert = {
      title,
      body
    };
    notification.sound = 'default';
    notification.badge = 1;
    notification.topic = process.env.APNS_BUNDLE_ID || 'com.faydana.app';
    notification.payload = data;

    const result = await apnsProvider.send(notification, token);

    if (result.sent.length > 0) {
      console.log(`✅ APNs bildirimi gönderildi: ${result.sent[0]}`);
      return { success: true, messageId: result.sent[0] };
    } else if (result.failed.length > 0) {
      const failure = result.failed[0];
      console.error(`❌ APNs gönderme hatası: ${failure.error}`);

      // Invalid token kontrolü
      if (failure.error === 'BadDeviceToken' || failure.error === 'Unregistered') {
        return { success: false, message: 'Invalid token', shouldRemoveToken: true };
      }

      return { success: false, message: failure.error };
    }

    return { success: false, message: 'Bilinmeyen hata' };
  } catch (error) {
    console.error('❌ APNs gönderme hatası:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Toplu push gönder (batch)
 */
const sendBulkPushNotifications = async (users, title, body, data = {}) => {
  const results = {
    success: 0,
    failed: 0,
    invalidTokens: []
  };

  for (const user of users) {
    const result = await sendPushNotification(user, title, body, data);
    
    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      
      if (result.shouldRemoveToken) {
        results.invalidTokens.push(user._id);
      }
    }

    // Rate limit koruması (100ms bekleme)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
};

/**
 * Backend başlangıcında Firebase/APNs'i test et
 */
const testPushNotificationSetup = () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 PUSH NOTIFICATION SETUP TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Firebase test
  const fcmResult = initializeFCM();
  if (fcmResult) {
    console.log('✅ Firebase (FCM) hazır - Android bildirimleri aktif');
  } else {
    console.log('⚠️ Firebase (FCM) devre dışı - Android bildirimleri çalışmayacak');
  }
  
  // APNs test
  const apnsResult = initializeAPNs();
  if (apnsResult) {
    console.log('✅ APNs hazır - iOS bildirimleri aktif');
  } else {
    console.log('⚠️ APNs devre dışı - iOS bildirimleri çalışmayacak');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return { fcm: fcmResult, apns: apnsResult };
};

module.exports = {
  initializeFCM,
  initializeAPNs,
  sendPushNotification,
  sendFCMNotification,
  sendAPNsNotification,
  sendBulkPushNotifications,
  testPushNotificationSetup
};

