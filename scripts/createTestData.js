const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Banner = require('../models/Banner');

// Samsun koordinatları ve ilçeleri
const SAMSUN_COORDINATES = {
  lat: 41.2928,
  lng: 36.3311
};

const SAMSUN_DISTRICTS = [
  { name: 'Atakum', lat: 41.3379, lng: 36.2677 },
  { name: 'İlkadım', lat: 41.2928, lng: 36.3311 },
  { name: 'Canik', lat: 41.2583, lng: 36.3375 },
  { name: 'Tekkeköy', lat: 41.2167, lng: 36.4667 },
  { name: 'Bafra', lat: 41.5667, lng: 35.9000 },
  { name: 'Çarşamba', lat: 41.2000, lng: 36.7333 },
  { name: 'Terme', lat: 41.2167, lng: 37.0167 },
  { name: 'Alaçam', lat: 41.6167, lng: 35.6000 },
  { name: 'Vezirköprü', lat: 41.1500, lng: 35.4500 },
  { name: 'Havza', lat: 40.9667, lng: 35.6667 }
];

const CATEGORIES = [
  'Kahve',
  'Yiyecek',
  'Bar/Pub',
  'Giyim',
  'Kuaför',
  'Spor',
  'Tatlı',
  'Mobilya',
  'El Sanatları',
  'Market'
];

const BRAND_NAMES = [
  'Kahve Dünyası',
  'Lezzet Durağı',
  'Gece Kulübü',
  'Moda Evi',
  'Güzellik Salonu',
  'Fitness Center',
  'Tatlıcı',
  'Mobilya Mağazası',
  'El Sanatları Atölyesi',
  'Süper Market'
];

const BANNER_TITLES = [
  'Akşam Saatlerinde %30 İndirim',
  'Öğle Menüsünde %25 İndirim',
  'Hafta Sonu Özel Fırsatlar',
  'Yeni Sezon %40 İndirim',
  'Güzellik Paketi %20 İndirim',
  'Spor Üyeliği %15 İndirim',
  'Tatlı Çeşitlerinde %35 İndirim',
  'Mobilya Setlerinde %30 İndirim',
  'El Sanatları Kursu %20 İndirim',
  'Market Alışverişinde %10 İndirim'
];

const BANNER_DESCRIPTIONS = [
  'Akşam 18:00-23:00 arası tüm ürünlerde %30 indirim fırsatı!',
  'Öğle saatlerinde özel menümüzde %25 indirim. Kaçırma!',
  'Hafta sonu özel fırsatlarımızdan yararlanın. %30\'a varan indirimler!',
  'Yeni sezon koleksiyonumuzda %40 indirim. Hemen gelin!',
  'Güzellik paketlerimizde %20 indirim. Randevu alın!',
  'Spor üyeliğinde %15 indirim. Sağlıklı yaşam için!',
  'Tatlı çeşitlerimizde %35 indirim. Lezzet dolu anlar!',
  'Mobilya setlerinde %30 indirim. Evinizi güzelleştirin!',
  'El sanatları kurslarımızda %20 indirim. Yaratıcılığınızı keşfedin!',
  'Market alışverişinde %10 indirim. Günlük ihtiyaçlarınız için!'
];

async function createTestData() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('🔗 MongoDB bağlantısı başarılı');

    // Mevcut test verilerini temizle (opsiyonel)
    const clearData = process.argv.includes('--clear');
    if (clearData) {
      console.log('🗑️  Mevcut test verileri temizleniyor...');
      await User.deleteMany({ phone: { $regex: /^555\d{7}$/ } });
      await Restaurant.deleteMany({ name: { $in: BRAND_NAMES } });
      await Banner.deleteMany({ title: { $in: BANNER_TITLES } });
      console.log('✅ Temizleme tamamlandı');
    }

    const createdBrands = [];
    const createdRestaurants = [];
    const createdBanners = [];

    for (let i = 0; i < 10; i++) {
      const phone = `555${String(i + 1).padStart(7, '0')}`;
      const password = 'test1234';
      const name = BRAND_NAMES[i];
      const category = CATEGORIES[i];
      const district = SAMSUN_DISTRICTS[i];
      const email = `${name.toLowerCase().replace(/\s+/g, '')}@test.com`;
      const address = `${district.name} Mh. ${i + 1}. Sokak No:${i + 1}`;

      // Kullanıcı zaten var mı kontrol et
      let user = await User.findOne({ phone });
      
      if (!user) {
        // Şifreyi hash'le
        const hashedPassword = await bcrypt.hash(password, 10);

        // Marka kullanıcısı oluştur
        user = new User({
          phone,
          password: hashedPassword,
          name,
          email,
          userType: 'brand',
          category,
          city: 'Samsun',
          address,
          latitude: district.lat,
          longitude: district.lng,
          phoneVerified: true,
          credits: 10,
          oneSignalExternalId: phone
        });

        await user.save();
        console.log(`✅ Marka oluşturuldu: ${name} (${phone})`);
      } else {
        console.log(`⚠️  Marka zaten mevcut: ${name} (${phone})`);
      }

      createdBrands.push(user);

      // Restaurant oluştur
      let restaurant = await Restaurant.findOne({ name });
      
      if (!restaurant) {
        restaurant = new Restaurant({
          name,
          type: category === 'Kahve' ? 'cafe' : 
                category === 'Bar/Pub' ? 'bar' : 
                category === 'Yiyecek' ? 'restaurant' : 'other',
          address: {
            street: address,
            city: 'Samsun',
            district: district.name,
            coordinates: {
              lat: district.lat,
              lng: district.lng
            }
          },
          contact: {
            phone: phone,
            email: email
          },
          logo: null,
          description: `${name} - ${category} kategorisinde hizmet veren bir işletme.`,
          isActive: true,
          codeQuota: {
            total: 1000,
            used: 0,
            remaining: 1000
          }
        });

        await restaurant.save();
        console.log(`✅ Restoran oluşturuldu: ${name}`);
      } else {
        console.log(`⚠️  Restoran zaten mevcut: ${name}`);
      }

      createdRestaurants.push(restaurant);

      // Banner oluştur
      const bannerTitle = BANNER_TITLES[i];
      const bannerDescription = BANNER_DESCRIPTIONS[i];
      
      let banner = await Banner.findOne({ title: bannerTitle, restaurant: restaurant._id });
      
      if (!banner) {
        // Kampanya tarihleri (bugünden itibaren 30 gün)
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        endDate.setHours(23, 59, 59, 0);

        banner = new Banner({
          restaurant: restaurant._id,
          title: bannerTitle,
          description: bannerDescription,
          aiGeneratedText: bannerDescription,
          bannerImage: null, // Gerçek banner görseli eklenebilir
          campaign: {
            startDate,
            endDate,
            startTime: '09:00',
            endTime: '22:00',
            daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            isActive: true
          },
          targetAudience: {
            ageRange: {
              min: 18,
              max: 65
            },
            gender: 'all',
            location: {
              radius: 5, // 5 km
              coordinates: {
                lat: district.lat,
                lng: district.lng
              }
            }
          },
          bannerLocation: {
            city: 'Samsun',
            district: district.name,
            address: address,
            coordinates: {
              latitude: district.lat,
              longitude: district.lng
            }
          },
          category,
          status: 'active',
          approvalStatus: 'approved',
          approvedAt: new Date(),
          stats: {
            views: 0,
            clicks: 0,
            conversions: 0
          },
          offerType: 'percentage',
          discount: category === 'Kahve' ? 30 : 
                   category === 'Yiyecek' ? 25 : 
                   category === 'Bar/Pub' ? 20 : 
                   category === 'Giyim' ? 40 : 
                   category === 'Kuaför' ? 20 : 
                   category === 'Spor' ? 15 : 
                   category === 'Tatlı' ? 35 : 
                   category === 'Mobilya' ? 30 : 
                   category === 'El Sanatları' ? 20 : 
                   category === 'Market' ? 10 : 20
        });

        await banner.save();
        console.log(`✅ Banner oluşturuldu: ${bannerTitle}`);
      } else {
        console.log(`⚠️  Banner zaten mevcut: ${bannerTitle}`);
      }

      createdBanners.push(banner);
    }

    console.log('\n📊 Oluşturulan Veriler:');
    console.log(`   - ${createdBrands.length} Marka`);
    console.log(`   - ${createdRestaurants.length} Restoran`);
    console.log(`   - ${createdBanners.length} Banner`);
    
    console.log('\n📱 Giriş Bilgileri:');
    createdBrands.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.name}`);
      console.log(`      Telefon: ${user.phone}`);
      console.log(`      Şifre: test1234`);
      console.log(`      Kategori: ${user.category}`);
      console.log(`      Konum: ${SAMSUN_DISTRICTS[index].name}, Samsun`);
      console.log(`      Koordinat: ${user.latitude}, ${user.longitude}`);
      console.log('');
    });

    console.log('🎉 Test verileri başarıyla oluşturuldu!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

createTestData();

