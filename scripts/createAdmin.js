const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdmin() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🔗 MongoDB bağlantısı başarılı');

    // Admin kullanıcısını kontrol et
    const existingAdmin = await User.findOne({ phone: 'alperen55' });
    
    if (existingAdmin) {
      console.log('⚠️  Admin kullanıcısı zaten mevcut');
      
      // Admin değilse güncelle
      if (!existingAdmin.isAdmin) {
        existingAdmin.isAdmin = true;
        existingAdmin.userType = 'admin';
        await existingAdmin.save();
        console.log('✅ Mevcut kullanıcı admin yapıldı');
      }
    } else {
      // Yeni admin oluştur
      const admin = new User({
        phone: 'alperen55',
        password: 'test1234', // Pre-save hook ile hash'lenecek
        name: 'Admin Alperen',
        userType: 'admin',
        isAdmin: true,
        phoneVerified: true,
        credits: 0 // Admin'in krediye ihtiyacı yok
      });

      await admin.save();
      console.log('✅ Admin kullanıcısı oluşturuldu');
      console.log('📱 Telefon: alperen55');
      console.log('🔑 Şifre: test1234');
    }

    console.log('🎉 İşlem tamamlandı!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

createAdmin();

