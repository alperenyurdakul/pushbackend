const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateProfilePhoto() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana');
    
    console.log('🔗 MongoDB bağlantısı başarılı');

    // Kullanıcıları listele
    const users = await User.find({}).limit(10).select('_id name phone profilePhoto userType');
    
    console.log('\n📊 Kullanıcılar:');
    users.forEach((u, index) => {
      console.log(`${index + 1}. _id: ${u._id}`);
      console.log(`   Name: ${u.name}`);
      console.log(`   Phone: ${u.phone}`);
      console.log(`   Type: ${u.userType}`);
      console.log(`   Photo: ${u.profilePhoto || 'YOK'}`);
      console.log('');
    });

    // Belirli telefon numarasına göre kullanıcıyı bul
    const targetPhone = '5434456202';
    const targetUser = await User.findOne({ phone: targetPhone });
    
    if (targetUser) {
      // Test için placeholder bir fotoğraf URL'i
      const testPhotoUrl = 'https://via.placeholder.com/300/ff5f5c/ffffff?text=Profile+Photo';
      
      targetUser.profilePhoto = testPhotoUrl;
      await targetUser.save();
      
      console.log(`✅ ${targetUser.name} (${targetUser.phone}) kullanıcısına profil fotoğrafı eklendi!`);
      console.log(`   URL: ${testPhotoUrl}`);
    } else {
      console.log(`⚠️ ${targetPhone} numaralı kullanıcı bulunamadı`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

updateProfilePhoto();

