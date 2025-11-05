// OneSignal Player ID kontrolü için script
const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB bağlantısı
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana')
  .then(() => console.log('✅ MongoDB bağlantısı başarılı'))
  .catch(err => console.error('❌ MongoDB bağlantı hatası:', err));

const User = require('../models/User');

async function checkUser(userId) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('❌ Kullanıcı bulunamadı');
      return;
    }
    
    console.log('\n📱 Kullanıcı Bilgileri:');
    console.log('- Ad:', user.name);
    console.log('- Telefon:', user.phone);
    console.log('- OneSignal Player ID:', user.oneSignalPlayerId || 'YOK ❌');
    console.log('- OneSignal User ID:', user.oneSignalUserId || 'YOK');
    console.log('- OneSignal External ID:', user.oneSignalExternalId || 'YOK');
    console.log('- Expo Push Token:', user.expoPushToken ? 'VAR ✅' : 'YOK');
    
    if (!user.oneSignalPlayerId) {
      console.log('\n⚠️  OneSignal Player ID kayıtlı değil!');
      console.log('💡 Çözüm: Bu kullanıcı ile uygulamadan çıkış yapıp tekrar giriş yapın.');
    } else {
      console.log('\n✅ OneSignal Player ID kayıtlı, bildirimler gönderilebilir!');
    }
    
  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Kullanım: node scripts/checkUserOneSignal.js USER_ID
const userId = process.argv[2];

if (!userId) {
  console.log('⚠️  Kullanım: node scripts/checkUserOneSignal.js USER_ID');
  console.log('Örnek: node scripts/checkUserOneSignal.js 68f152547f14c4cd8f27ed79');
  process.exit(1);
}

checkUser(userId);

