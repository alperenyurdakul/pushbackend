/**
 * Push Notification Test Script
 * 
 * Kullanım:
 * node test-push.js <phone>
 * 
 * Örnek:
 * node test-push.js 5434456202
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { sendPushNotification } = require('./services/pushNotificationService');
const User = require('./models/User');

const MONGODB_URI = process.env.MONGODB_URI;
const phone = process.argv[2] || '5434456202';

(async () => {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 PUSH NOTIFICATION TEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📱 Test edilecek telefon: ${phone}`);

    // MongoDB bağlantısı
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB bağlantısı başarılı');

    // Kullanıcıyı bul
    const user = await User.findOne({ phone });
    
    if (!user) {
      console.log(`❌ Kullanıcı bulunamadı: ${phone}`);
      process.exit(1);
    }

    console.log(`✅ Kullanıcı bulundu: ${user.name}`);
    console.log(`   Push Token: ${user.pushToken ? user.pushToken.substring(0, 30) + '...' : 'YOK'}`);
    console.log(`   Platform: ${user.pushPlatform || 'YOK'}`);
    console.log(`   Type: ${user.pushTokenType || 'YOK'}`);

    if (!user.pushToken) {
      console.log('❌ Push token yok! Önce token kaydetmelisin.');
      console.log('   Mobil app\'ten login ol veya token kaydet');
      process.exit(1);
    }

    // Test bildirimi gönder
    console.log('');
    console.log('📤 Test bildirimi gönderiliyor...');
    
    const result = await sendPushNotification(
      user,
      '🧪 Test Bildirimi',
      'Bu bir test bildirimi! Yeni push sistem testi.',
      { 
        type: 'test', 
        testId: '123',
        timestamp: new Date().toISOString()
      }
    );

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SONUÇ:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('');
      console.log('✅ BİLDİRİM GÖNDERİLDİ!');
      console.log(`   Mobil cihazında bildirim gelmeli: ${user.pushPlatform}`);
    } else {
      console.log('');
      console.log('❌ BİLDİRİM GÖNDERİLEMEDİ!');
      console.log(`   Hata: ${result.message}`);
      
      if (result.shouldRemoveToken) {
        console.log('⚠️ Token geçersiz! Database\'den silinmeli.');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test hatası:', error);
    process.exit(1);
  }
})();

