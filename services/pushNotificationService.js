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
          // Base64'den decode et ve string'e çevir
          const decodedKey = Buffer.from(process.env.APNS_KEY_BASE64, 'base64').toString('utf-8');
          console.log('📝 APNs key base64\'den decode edildi');
          console.log(`📝 Decode edilen key uzunluğu: ${decodedKey.length} karakter`);
          console.log(`📝 Decode edilen key başlangıcı: ${decodedKey.substring(0, 50)}...`);
          apnsKey = decodedKey;
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
      
      // Key'i satırlara böl ve temizle
      let keyLines = apnsKey.split('\n');
      
      // Her satırı temizle: başındaki/sonundaki whitespace ve gereksiz karakterler
      keyLines = keyLines.map((line, index) => {
        const originalLine = line;
        line = line.trim();
        
        // Sonundaki / karakterini KESINLIKLE temizle (tüm satırlarda)
        if (line.endsWith('/')) {
          console.log(`⚠️ Satır ${index}'de sonunda "/" karakteri bulundu: "${line.substring(line.length - 10)}"`);
          line = line.replace(/\/+$/, '');
          console.log(`✅ Temizlendi: "${line.substring(line.length - 10)}"`);
        }
        
        // Sonundaki whitespace'leri de temizle
        line = line.replace(/\s+$/, '');
        
        // Özel kontrol: Key içeriği satırında sonunda "/" karakteri varsa temizle
        // BEGIN ve END satırları hariç (ortadaki content satırlarını kontrol et)
        if (index > 0 && index < keyLines.length - 1) {
          // Sonunda "/" varsa KESINLIKLE temizle
          if (line.match(/\/+\s*$/)) {
            console.log(`⚠️ Content satır ${index}'de sonunda "/" veya whitespace bulundu: "${line.substring(Math.max(0, line.length - 20))}"`);
            line = line.replace(/[\/\s]+$/, '');
            console.log(`✅ Temizlendi: "${line.substring(Math.max(0, line.length - 20))}"`);
          }
        }
        
        return line;
      }).filter(line => line.length > 0);
      
      // BEGIN ve END satırlarını kontrol et
      if (keyLines[0] !== '-----BEGIN PRIVATE KEY-----') {
        console.error('❌ APNs key format hatası: BEGIN PRIVATE KEY satırı yanlış');
        return false;
      }
      
      if (keyLines[keyLines.length - 1] !== '-----END PRIVATE KEY-----') {
        // Son satırda END PRIVATE KEY yoksa, ekle
        // Önce son satırdaki gereksiz karakterleri temizle
        const lastLine = keyLines[keyLines.length - 1];
        if (lastLine.includes('-----END PRIVATE KEY-----')) {
          // END PRIVATE KEY içeriyor ama başka karakterler de var
          keyLines[keyLines.length - 1] = '-----END PRIVATE KEY-----';
        } else {
          // END PRIVATE KEY hiç yok, ekle
          keyLines.push('-----END PRIVATE KEY-----');
        }
      }
      
      // Key'i normalize et: Her satırın sonunda newline olsun
      const normalizedKey = keyLines.join('\n') + '\n';
      
      // Debug: Key'in son halini göster
      console.log(`📝 Key satır sayısı: ${keyLines.length}`);
      console.log(`📝 İlk satır: ${keyLines[0]}`);
      console.log(`📝 Son satır: ${keyLines[keyLines.length - 1]}`);
      console.log(`📝 Key uzunluğu: ${normalizedKey.length} karakter`);
      
      console.log(`📝 APNs key parse edildi (${normalizedKey.split('\n').length} satır)`);
      console.log(`📝 Key başlangıcı: ${normalizedKey.substring(0, 50)}...`);
      console.log(`📝 Key ID: ${process.env.APNS_KEY_ID}, Team ID: ${process.env.APNS_TEAM_ID}`);
      
      // Key-based authentication (önerilen)
      // NOT: apn paketi key'i string olarak alır (dosya yolu olarak algılayabilir)
      // Bu yüzden direkt string geçiyoruz (Buffer değil)
      
      // Key'i son kontrol et - son satırda sadece END PRIVATE KEY olmalı
      const finalKeyLines = normalizedKey.split('\n').filter(line => line.trim().length > 0);
      if (finalKeyLines.length < 3) {
        console.error('❌ APNs key format hatası: Key en az 3 satır olmalı (BEGIN, content, END)');
        console.error(`📝 Mevcut satır sayısı: ${finalKeyLines.length}`);
        return false;
      }
      
      // Son satırı kontrol et - sadece END PRIVATE KEY olmalı
      if (finalKeyLines[finalKeyLines.length - 1] !== '-----END PRIVATE KEY-----') {
        console.error('❌ APNs key format hatası: Son satır sadece -----END PRIVATE KEY----- olmalı');
        console.error(`📝 Son satır: "${finalKeyLines[finalKeyLines.length - 1]}"`);
        return false;
      }
      
      // Final key - sonundaki boş satırı kaldır
      const finalKey = finalKeyLines.join('\n');
      
      console.log(`📝 Final key hazırlandı (${finalKey.length} karakter, ${finalKeyLines.length} satır)`);
      console.log(`📝 Final key ilk 50 karakter: ${finalKey.substring(0, 50)}...`);
      console.log(`📝 Final key son 50 karakter: ...${finalKey.substring(finalKey.length - 50)}`);
      
      // Ortadaki satırları (content satırlarını) kontrol et
      if (finalKeyLines.length >= 3) {
        for (let i = 1; i < finalKeyLines.length - 1; i++) {
          const contentLine = finalKeyLines[i];
          console.log(`📝 Satır ${i} (content): "${contentLine.substring(0, 50)}${contentLine.length > 50 ? '...' : ''}" (${contentLine.length} karakter)`);
          
          // Sonunda "/" veya whitespace var mı kontrol et
          if (contentLine.endsWith('/') || contentLine.match(/[\/\s]+$/)) {
            console.error(`❌ Satır ${i}'de sonunda "/" veya whitespace bulundu!`);
            console.error(`   Orijinal: "${contentLine}"`);
            console.error(`   Son 10 karakter: "${contentLine.substring(contentLine.length - 10)}"`);
          }
        }
      }
      
      // Key'i geçici dosyaya yaz ve dosya yolunu kullan (en güvenli yöntem)
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      const tempKeyPath = path.join(os.tmpdir(), `apns-key-${Date.now()}.p8`);
      
      try {
        // Key'i dosyaya yaz (kesinlikle doğru format)
        // PEM formatı için sonunda newline OLMALI
        const keyToWrite = finalKey.endsWith('\n') ? finalKey : finalKey + '\n';
        
        fs.writeFileSync(tempKeyPath, keyToWrite, { encoding: 'utf8', mode: 0o600 });
        console.log(`📝 Key geçici dosyaya yazıldı: ${tempKeyPath}`);
        console.log(`📝 Dosyaya yazılan key uzunluğu: ${keyToWrite.length} karakter`);
        
        // Dosyadan oku ve kontrol et
        const readBackKey = fs.readFileSync(tempKeyPath, 'utf8');
        console.log(`📝 Dosyadan okunan key uzunluğu: ${readBackKey.length} karakter`);
        console.log(`📝 Dosyadan okunan key son 50 karakter: ...${readBackKey.substring(readBackKey.length - 50)}`);
        
        // Dosya içeriğini doğrula
        const fileLines = readBackKey.split('\n').filter(line => line.trim().length > 0);
        console.log(`📝 Dosya içeriği satır sayısı: ${fileLines.length}`);
        console.log(`📝 Dosya içeriği ilk satır: "${fileLines[0]}"`);
        console.log(`📝 Dosya içeriği son satır: "${fileLines[fileLines.length - 1]}"`);
        
        if (fileLines.length >= 3) {
          console.log(`📝 Dosya içeriği ortadaki satır uzunluğu: ${fileLines[1].length} karakter`);
          console.log(`📝 Dosya içeriği ortadaki satır son 20 karakter: "${fileLines[1].substring(Math.max(0, fileLines[1].length - 20))}"`);
        }
        
        // PEM format kontrolü
        if (!readBackKey.includes('-----BEGIN PRIVATE KEY-----') || !readBackKey.includes('-----END PRIVATE KEY-----')) {
          console.error('❌ Key dosyası PEM formatında değil!');
          return false;
        }
        
        // Dosya yolunu kullan (apn paketi dosya yolunu tercih eder)
        console.log(`📝 APNs Provider oluşturuluyor (dosya yolu ile)...`);
        console.log(`📝 Key ID: ${process.env.APNS_KEY_ID}, Team ID: ${process.env.APNS_TEAM_ID}`);
        console.log(`📝 Production: ${process.env.APNS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production'}`);
        
        apnsProvider = new apn.Provider({
          token: {
            key: tempKeyPath, // Dosya yolu olarak geç (en güvenli)
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID
          },
          production: process.env.APNS_PRODUCTION === 'true' || process.env.NODE_ENV === 'production'
        });
        
        console.log('✅ APNs Provider başlatıldı (Key-based - dosya yolu ile)');
        
        // Geçici dosyayı temizleme işini shutdown'a bırak
        // (uygulama kapanırken temizlenecek)
        process.on('exit', () => {
          try {
            if (fs.existsSync(tempKeyPath)) {
              fs.unlinkSync(tempKeyPath);
              console.log(`🧹 Geçici key dosyası temizlendi: ${tempKeyPath}`);
            }
          } catch (err) {
            // Ignore
          }
        });
        
        return true;
      } catch (providerError) {
        // Hata durumunda geçici dosyayı temizle
        try {
          if (fs.existsSync(tempKeyPath)) {
            fs.unlinkSync(tempKeyPath);
          }
        } catch (err) {
          // Ignore
        }
        console.error('❌ APNs Provider başlatma hatası:', providerError.message);
        console.error('❌ Hata detayları:', providerError);
        
        // Key formatını tekrar göster
        console.error('📝 Key format kontrolü:');
        console.error(`  İlk satır: "${finalKeyLines[0]}"`);
        if (finalKeyLines.length >= 3) {
          console.error(`  Ortadaki satır (content): "${finalKeyLines[1]}"`);
          console.error(`  Ortadaki satır uzunluğu: ${finalKeyLines[1].length} karakter`);
          console.error(`  Ortadaki satır son 20 karakter: "${finalKeyLines[1].substring(finalKeyLines[1].length - 20)}"`);
        }
        console.error(`  Son satır: "${finalKeyLines[finalKeyLines.length - 1]}"`);
        console.error(`  Toplam satır: ${finalKeyLines.length}`);
        
        // Key'in tamamını göster (debug için)
        console.error('📝 Final key (tamamı):');
        console.error(finalKey.split('\n').map((line, idx) => `${idx}: "${line}"`).join('\n'));
        
        console.error('💡 ÖNERİ: Key\'in ortadaki satırında sonunda "/" karakteri olabilir.');
        console.error('💡 Yeni bir key oluştur ve tekrar dene.');
        
        return false;
      }
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
    const tokenType = user.pushTokenType;
    const token = user.pushToken;

    // Platform tespiti (önce token type, sonra platform)
    let targetPlatform = null;
    
    if (tokenType === 'fcm') {
      targetPlatform = 'fcm';
    } else if (tokenType === 'apns') {
      targetPlatform = 'apns';
    } else if (platform === 'android') {
      targetPlatform = 'fcm';
    } else if (platform === 'ios') {
      targetPlatform = 'apns';
    } else {
      // Token formatına göre tespit et
      // FCM token genelde daha uzun ve farklı format
      // APNs token (Expo push token) genelde "ExponentPushToken[...]" ile başlar
      if (token.startsWith('ExponentPushToken[')) {
        // Expo push token - platform'a göre karar ver
        // Android için FCM, iOS için APNs kullanılır
        // Ama Expo token'ı direkt kullanılamaz, Expo Push Notification service kullanılmalı
        console.log(`⚠️ Expo push token algılandı: ${token.substring(0, 30)}...`);
        console.log(`   Bu token direkt FCM/APNs ile gönderilemez, Expo Push Notification service kullanılmalı`);
        return { success: false, message: 'Expo push token - direkt FCM/APNs ile gönderilemez' };
      } else if (token.length > 100) {
        // Uzun token - muhtemelen FCM
        targetPlatform = 'fcm';
        console.log(`💡 Token uzunluğuna göre FCM olarak kabul edildi`);
      } else {
        // Kısa token - muhtemelen APNs
        targetPlatform = 'apns';
        console.log(`💡 Token uzunluğuna göre APNs olarak kabul edildi`);
      }
    }

    if (targetPlatform === 'fcm') {
      // FCM (Android)
      console.log(`📱 FCM bildirimi gönderiliyor...`);
      return await sendFCMNotification(token, title, body, data);
    } else if (targetPlatform === 'apns') {
      // APNs (iOS)
      console.log(`📱 APNs bildirimi gönderiliyor...`);
      return await sendAPNsNotification(token, title, body, data);
    } else {
      console.log(`⚠️ Bilinmeyen platform: platform=${platform}, tokenType=${tokenType}`);
      return { success: false, message: 'Bilinmeyen platform' };
    }
  } catch (error) {
    console.error('❌ Push gönderme hatası:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    return { success: false, message: error.message || 'Push gönderme hatası' };
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
    notification.topic = process.env.APNS_BUNDLE_ID || 'com.faydana.alperen';
    notification.payload = data;

    const result = await apnsProvider.send(notification, token);

    console.log(`📱 APNs send sonucu:`, JSON.stringify(result, null, 2));

    if (result.sent && result.sent.length > 0) {
      console.log(`✅ APNs bildirimi gönderildi: ${result.sent[0]}`);
      return { success: true, messageId: result.sent[0] };
    } else if (result.failed && result.failed.length > 0) {
      const failure = result.failed[0];
      
      // Detaylı hata log'u
      console.error(`❌ APNs gönderme hatası:`);
      console.error(`   Failure objesi:`, JSON.stringify(failure, null, 2));
      console.error(`   Failure.error:`, failure.error);
      console.error(`   Failure.response:`, failure.response);
      console.error(`   Failure.device:`, failure.device);
      console.error(`   Failure.status:`, failure.status);
      
      const errorMessage = failure.error || failure.response?.reason || failure.response?.reason || 'Bilinmeyen APNs hatası';
      console.error(`   Hata mesajı: ${errorMessage}`);

      // Invalid token kontrolü
      const errorCode = failure.error || failure.response?.reason || '';
      if (errorCode === 'BadDeviceToken' || errorCode === 'Unregistered' || errorCode === '410') {
        return { success: false, message: 'Invalid token', shouldRemoveToken: true };
      }

      return { success: false, message: errorMessage };
    }

    console.error(`⚠️ APNs sonucu beklenmedik:`, JSON.stringify(result, null, 2));
    return { success: false, message: 'Bilinmeyen hata - result yapısı beklenmedik' };
  } catch (error) {
    console.error('❌ APNs gönderme hatası (catch):', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    return { success: false, message: error.message || 'APNs gönderme hatası' };
  }
};

/**
 * Toplu push gönder (batch) - CONCURRENT (1M+ kullanıcı için optimize)
 */
const sendBulkPushNotifications = async (users, title, body, data = {}) => {
  const results = {
    success: 0,
    failed: 0,
    invalidTokens: []
  };

  const totalUsers = users.length;
  console.log(`📤 Toplu push başlatıldı: ${totalUsers} kullanıcı`);
  
  // CONCURRENT SENDING (100 concurrent batch)
  // 1M kullanıcı = 27 saat (sequential) → 5 dakika (concurrent)!
  const CONCURRENT_BATCH_SIZE = 100; // Aynı anda 100 bildirim gönder
  const chunks = [];
  
  // Kullanıcıları chunk'lara böl
  for (let i = 0; i < users.length; i += CONCURRENT_BATCH_SIZE) {
    chunks.push(users.slice(i, i + CONCURRENT_BATCH_SIZE));
  }
  
  console.log(`📦 ${chunks.length} chunk'a bölündü (her biri max ${CONCURRENT_BATCH_SIZE} kullanıcı)`);
  
  let processedUsers = 0;
  
  // Her chunk'ı sırayla işle (rate limiting için)
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    
    // Chunk içindeki tüm bildirimleri paralel gönder
    const chunkPromises = chunk.map(async (user) => {
      try {
        // Detaylı log sadece ilk 5 kullanıcı için
        if (processedUsers < 5) {
          console.log(`📱 Bildirim gönderiliyor: ${user.name || user.phone}`);
          console.log(`   Platform: ${user.pushPlatform || 'unknown'}`);
          console.log(`   Token Type: ${user.pushTokenType || 'unknown'}`);
          console.log(`   Token: ${user.pushToken ? user.pushToken.substring(0, 20) + '...' : 'YOK'}`);
        }
        
        const result = await sendPushNotification(user, title, body, data);
        
        if (result.success) {
          results.success++;
          if (processedUsers < 5) {
            console.log(`   ✅ Başarılı`);
          }
        } else {
          results.failed++;
          if (processedUsers < 5) {
            console.log(`   ❌ Başarısız: ${result.message || 'Bilinmeyen hata'}`);
          }
          
          if (result.shouldRemoveToken) {
            results.invalidTokens.push(user._id);
            if (processedUsers < 5) {
              console.log(`   🧹 Token işaretlendi (silinecek)`);
            }
          }
        }
        
        processedUsers++;
        
        // Her 1000 kullanıcıda bir progress log
        if (processedUsers % 1000 === 0) {
          console.log(`📊 İlerleme: ${processedUsers}/${totalUsers} (${Math.round(processedUsers / totalUsers * 100)}%) - Başarılı: ${results.success}, Başarısız: ${results.failed}`);
        }
        
        return result;
      } catch (error) {
        results.failed++;
        console.error(`❌ Bildirim hatası (${user.name || user.phone}):`, error.message);
        return { success: false, message: error.message };
      }
    });
    
    // Chunk'ı paralel işle (100 concurrent)
    await Promise.all(chunkPromises);
    
    // Rate limiting: Her chunk arasında kısa bekleme (FCM/APNs rate limit koruması)
    // FCM: 1000 req/s, APNs: 10000 req/s
    // 100 concurrent batch + 50ms bekleme = ~2000 req/s (güvenli)
    if (chunkIndex < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms bekleme
    }
  }

  console.log(`📊 Toplu push tamamlandı: ${results.success} başarılı, ${results.failed} başarısız`);
  console.log(`📈 İşlenen kullanıcı: ${processedUsers}/${totalUsers} (${Math.round(processedUsers / totalUsers * 100)}%)`);
  
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

