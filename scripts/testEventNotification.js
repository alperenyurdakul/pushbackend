const mongoose = require('mongoose');
require('dotenv').config();

const Event = require('../models/Event');
const User = require('../models/User');
const OneSignalService = require('../services/oneSignalService');

// MongoDB bağlantısı
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana');
    console.log('✅ MongoDB bağlantısı başarılı');
  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error);
    process.exit(1);
  }
}

async function testEventNotification() {
  try {
    await connectDB();
    
    console.log('\n🧪 Event Bildirim Testi Başlatılıyor...\n');
    
    // 1. Pending event bul veya oluştur
    let testEvent = await Event.findOne({ approvalStatus: 'pending' });
    
    if (!testEvent) {
      console.log('⚠️ Pending event bulunamadı, test eventi oluşturuluyor...');
      
      // Bir kullanıcı bul (organizer olarak kullanılacak)
      const testUser = await User.findOne({ userType: 'customer' });
      if (!testUser) {
        console.error('❌ Test için kullanıcı bulunamadı!');
        process.exit(1);
      }
      
      // Test eventi oluştur
      testEvent = new Event({
        organizerId: testUser._id,
        organizerName: testUser.name || 'Test Organizatör',
        organizerProfilePhoto: testUser.profilePhoto,
        title: 'Test Etkinliği - Bildirim Testi',
        description: 'Bu bir test etkinliğidir',
        category: 'Teknoloji',
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 gün sonra
        endDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 gün sonra
        location: 'Atakum,Samsun', // Test için location string
        address: {
          street: 'Test Caddesi',
          district: 'Atakum',
          city: 'Samsun'
        },
        participantLimit: 50,
        approvalStatus: 'pending',
        status: 'upcoming'
      });
      
      await testEvent.save();
      console.log('✅ Test eventi oluşturuldu:', {
        eventId: testEvent._id,
        title: testEvent.title,
        location: testEvent.location,
        address: testEvent.address
      });
    } else {
      console.log('✅ Mevcut pending event bulundu:', {
        eventId: testEvent._id,
        title: testEvent.title,
        location: testEvent.location,
        address: testEvent.address
      });
    }
    
    // 2. Event detaylarını göster
    console.log('\n📋 Event Detayları:');
    console.log({
      eventId: testEvent._id,
      title: testEvent.title,
      category: testEvent.category,
      location: testEvent.location,
      address: testEvent.address,
      approvalStatus: testEvent.approvalStatus
    });
    
    // 3. Şehir bilgisini parse et (admin.js'deki mantık)
    let eventCity = null;
    
    if (testEvent.address && testEvent.address.city) {
      eventCity = testEvent.address.city.trim();
      console.log(`\n📍 Event şehri (address.city): "${eventCity}"`);
    } else if (testEvent.location && typeof testEvent.location === 'string') {
      const locationParts = testEvent.location.split(',').map(part => part.trim());
      eventCity = locationParts.length > 0 ? locationParts[locationParts.length - 1] : locationParts[0];
      console.log(`\n📍 Event şehri (location string parse): "${eventCity}" (location: "${testEvent.location}")`);
    }
    
    // Normalize et
    if (eventCity) {
      eventCity = eventCity.trim();
      if (eventCity !== '') {
        eventCity = eventCity.charAt(0).toUpperCase() + eventCity.slice(1).toLowerCase();
      } else {
        eventCity = null;
      }
    }
    
    const eventCategory = testEvent.category || null;
    
    console.log(`\n📍 Event şehri (normalize edilmiş): ${eventCity || 'Belirtilmemiş'}, Kategori: ${eventCategory || 'Belirtilmemiş'}`);
    
    // 4. Kullanıcı tercihlerini kontrol et
    console.log('\n👥 Kullanıcı Tercihleri Kontrolü:');
    const usersWithCity = await User.find({ 
      userType: 'customer',
      'preferences.city': { $exists: true, $ne: null }
    }).limit(5).select('phone preferences.city preferences.categories oneSignalExternalId');
    
    console.log(`Toplam ${usersWithCity.length} kullanıcının şehir tercihi var:`);
    usersWithCity.forEach((user, index) => {
      console.log(`${index + 1}. ${user.phone} - Şehir: "${user.preferences.city}", Kategori: ${JSON.stringify(user.preferences.categories)}, OneSignal: ${user.oneSignalExternalId ? 'Var' : 'Yok'}`);
    });
    
    // 5. Query testi - manuel olarak
    console.log('\n🧪 Manuel Query Testi:');
    const testCityRegex = new RegExp(`^\\s*${eventCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    
    // Test 1: Sadece şehir
    const testQuery1 = {
      userType: 'customer',
      oneSignalExternalId: { $exists: true, $ne: null },
      'preferences.city': { $regex: testCityRegex }
    };
    const result1 = await User.find(testQuery1);
    console.log(`Test 1 - Sadece şehir: ${result1.length} kullanıcı bulundu`);
    
    // Test 2: Şehir + Kategori (AND)
    const testQuery2 = {
      userType: 'customer',
      oneSignalExternalId: { $exists: true, $ne: null },
      $and: [
        { 'preferences.city': { $regex: testCityRegex } },
        {
          $or: [
            { 'preferences.categories': { $in: [eventCategory] } },
            { 'preferences.categories': { $exists: false } },
            { 'preferences.categories': [] },
            { 'preferences.categories': null }
          ]
        }
      ]
    };
    const result2 = await User.find(testQuery2);
    console.log(`Test 2 - Şehir + Kategori (AND): ${result2.length} kullanıcı bulundu`);
    if (result2.length > 0) {
      console.log('Bulunan kullanıcılar:', result2.map(u => ({
        phone: u.phone,
        city: u.preferences?.city,
        categories: u.preferences?.categories
      })));
    }
    
    // 5. OneSignalService'e test çağrısı yap
    console.log('\n📱 OneSignalService Test Çağrısı:');
    console.log('Parametreler:', {
      title: '🎪 Yeni Etkinlik!',
      message: `${testEvent.title} - ${testEvent.organizerName}`,
      data: {
        type: 'new_event',
        eventId: testEvent._id.toString(),
        title: testEvent.title,
        organizerName: testEvent.organizerName,
        category: eventCategory,
        timestamp: new Date().toISOString()
      },
      bannerCity: eventCity,
      bannerCategory: eventCategory
    });
    
    const oneSignalResult = await OneSignalService.sendToAll(
      '🎪 Yeni Etkinlik!',
      `${testEvent.title} - ${testEvent.organizerName}`,
      { 
        type: 'new_event',
        eventId: testEvent._id.toString(),
        title: testEvent.title,
        organizerName: testEvent.organizerName,
        category: eventCategory,
        timestamp: new Date().toISOString()
      },
      eventCity,
      null  // Kategori filtresi kaldırıldı - sadece şehir bazlı bildirim
    );
    
    console.log('\n✅ OneSignal Sonucu:', oneSignalResult);
    
    // 6. Event'i onayla (gerçek onaylama işlemi)
    console.log('\n🔐 Event Onaylanıyor...');
    testEvent.approvalStatus = 'approved';
    testEvent.approvedAt = new Date();
    testEvent.status = 'upcoming';
    await testEvent.save();
    
    console.log('✅ Event onaylandı ve bildirim gönderildi!');
    
  } catch (error) {
    console.error('\n❌ Test Hatası:', error);
    console.error('Error Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ MongoDB bağlantısı kapatıldı');
    process.exit(0);
  }
}

// Testi çalıştır
testEventNotification();

