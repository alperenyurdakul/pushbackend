const mongoose = require('mongoose');
const User = require('../models/User');
const Banner = require('../models/Banner');
require('dotenv').config();

async function updateExistingData() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🔗 MongoDB bağlantısı başarılı');

    // 1. Mevcut brand ve eventBrand kullanıcılarına 10 kredi ekle
    const brandUsers = await User.find({ 
      userType: { $in: ['brand', 'eventBrand'] },
      credits: { $exists: false }
    });
    
    console.log(`📊 ${brandUsers.length} adet markaya kredi eklenecek`);
    
    for (const user of brandUsers) {
      user.credits = 10;
      await user.save();
      console.log(`✅ ${user.name} - 10 kredi eklendi`);
    }

    // 2. Mevcut banner'ları onaylanmış olarak işaretle
    const existingBanners = await Banner.find({ 
      approvalStatus: { $exists: false }
    });
    
    console.log(`📊 ${existingBanners.length} adet banner onaylanacak`);
    
    for (const banner of existingBanners) {
      banner.approvalStatus = 'approved';
      banner.approvedAt = new Date();
      await banner.save();
      console.log(`✅ ${banner.title} - onaylandı`);
    }

    console.log('🎉 Güncelleme tamamlandı!');
    console.log(`✅ ${brandUsers.length} markaya kredi eklendi`);
    console.log(`✅ ${existingBanners.length} banner onaylandı`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

updateExistingData();

