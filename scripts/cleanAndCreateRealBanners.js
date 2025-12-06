const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Banner = require('../models/Banner');

// Samsun koordinatları ve ilçeleri
const SAMSUN_LOCATIONS = [
  { city: 'Samsun', district: 'Atakum', address: 'Atakum Sahil Yolu No:123', lat: 41.3379, lng: 36.2677 },
  { city: 'Samsun', district: 'İlkadım', address: 'Cumhuriyet Meydanı No:45', lat: 41.2928, lng: 36.3311 },
  { city: 'Samsun', district: 'Canik', address: 'Canik Caddesi No:78', lat: 41.2583, lng: 36.3375 },
  { city: 'Samsun', district: 'Tekkeköy', address: 'Tekkeköy Merkez No:156', lat: 41.2167, lng: 36.4667 },
  { city: 'Samsun', district: 'Bafra', address: 'Bafra Sahil Yolu No:89', lat: 41.5667, lng: 35.9000 },
  { city: 'Samsun', district: 'Çarşamba', address: 'Çarşamba Merkez No:234', lat: 41.2000, lng: 36.7333 },
  { city: 'Samsun', district: 'Terme', address: 'Terme Sahil Caddesi No:67', lat: 41.2167, lng: 37.0167 },
  { city: 'Samsun', district: 'Alaçam', address: 'Alaçam Merkez No:145', lat: 41.6167, lng: 35.6000 },
  { city: 'Samsun', district: 'Vezirköprü', address: 'Vezirköprü Merkez No:12', lat: 41.1500, lng: 35.4500 },
  { city: 'Samsun', district: 'Havza', address: 'Havza Merkez No:56', lat: 40.9667, lng: 35.6667 },
  { city: 'Samsun', district: 'Atakum', address: 'Kurupelit Mahallesi No:234', lat: 41.3500, lng: 36.2500 },
  { city: 'Samsun', district: 'İlkadım', address: 'Kale Mahallesi No:78', lat: 41.3000, lng: 36.3500 },
  { city: 'Samsun', district: 'Canik', address: 'Gölalan Mahallesi No:90', lat: 41.2700, lng: 36.3200 },
  { city: 'Samsun', district: 'Atakum', address: 'Çatalçam Mahallesi No:1', lat: 41.3200, lng: 36.2800 },
  { city: 'Samsun', district: 'İlkadım', address: 'Kadıköy Mahallesi No:345', lat: 41.2800, lng: 36.3400 }
];

// Özgün marka isimleri ve kategoriler (Samsun)
const BRANDS = [
  { name: 'Sahil Kahvesi', category: 'Kahve', brandType: 'Kafe', logo: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=400&h=400&fit=crop' },
  { name: 'Lezzet Durağı', category: 'Yiyecek', brandType: 'Fast Food', logo: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&h=400&fit=crop' },
  { name: 'Moda Evi Samsun', category: 'Giyim', brandType: 'Mağaza', logo: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=400&fit=crop' },
  { name: 'Dondurma Köşesi', category: 'Tatlı', brandType: 'Dondurma', logo: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&h=400&fit=crop' },
  { name: 'Şık Giyim', category: 'Giyim', brandType: 'Mağaza', logo: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=400&h=400&fit=crop' },
  { name: 'Karadeniz Kahvesi', category: 'Kahve', brandType: 'Kafe', logo: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop' },
  { name: 'Pizza Köşkü', category: 'Yiyecek', brandType: 'Restoran', logo: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=400&fit=crop' },
  { name: 'Günlük Market', category: 'Market', brandType: 'Market', logo: 'https://images.unsplash.com/photo-1556910096-6f5e72db6803?w=400&h=400&fit=crop' },
  { name: 'Tavuk Evi', category: 'Yiyecek', brandType: 'Fast Food', logo: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&h=400&fit=crop' },
  { name: 'Kahve Bahçesi', category: 'Kahve', brandType: 'Kafe', logo: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=400&fit=crop' },
  { name: 'Teknoloji Mağazası', category: 'Market', brandType: 'Elektronik', logo: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=400&fit=crop' },
  { name: 'Hızlı Market', category: 'Market', brandType: 'Market', logo: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=400&fit=crop' },
  { name: 'Trend Moda', category: 'Giyim', brandType: 'Mağaza', logo: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=400&fit=crop' },
  { name: 'Tatlı Köşesi', category: 'Tatlı', brandType: 'Tatlıcı', logo: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=400&fit=crop' },
  { name: 'Sahil Kafe', category: 'Kahve', brandType: 'Kafe', logo: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop' }
];

// Banner başlıkları
const BANNER_TITLES = [
  'Kahve Keyfi %25 İndirim',
  'Lezzet Menüde %30 İndirim',
  'Yaz Koleksiyonunda %40 İndirim',
  'Dondurma Çeşitlerinde %20 İndirim',
  'Giyim Ürünlerinde %35 İndirim',
  'Kahve ve Atıştırmalık %15 İndirim',
  'Pizza Menülerinde %25 İndirim',
  'Market Alışverişinde %10 İndirim',
  'Tavuk Menülerinde %20 İndirim',
  'Kahve ve Pasta %18 İndirim',
  'Elektronik Ürünlerde %15 İndirim',
  'Günlük İhtiyaçlarda %12 İndirim',
  'Moda Ürünlerinde %30 İndirim',
  'Geleneksel Tatlılarda %22 İndirim',
  'Kahve ve Kahvaltı %20 İndirim'
];

// Banner açıklamaları
const BANNER_DESCRIPTIONS = [
  'Tüm kahve çeşitlerimizde ve atıştırmalıklarımızda %25 indirim fırsatı. Hemen gelin, keyifli anlar yaşayın!',
  'Seçili menülerimizde %30 indirim. Lezzet dolu deneyim için bizi ziyaret edin!',
  'Yaz koleksiyonumuzda %40\'a varan indirimler. Yeni sezon ürünlerimizi keşfedin!',
  'Dondurma çeşitlerimizde %20 indirim. Serinletici lezzetler için bizi ziyaret edin!',
  'Giyim ürünlerimizde %35 indirim. Şık ve modern kıyafetler için mağazamıza uğrayın!',
  'Kahve ve atıştırmalık ürünlerimizde %15 indirim. Keyifli sohbetler için ideal mekan!',
  'Pizza menülerimizde %25 indirim. İtalyan lezzetlerini deneyimleyin!',
  'Market alışverişinizde %10 indirim. Günlük ihtiyaçlarınızı uygun fiyata alın!',
  'Tavuk menülerimizde %20 indirim. Çıtır lezzetler için bizi ziyaret edin!',
  'Kahve ve pasta çeşitlerimizde %18 indirim. Tatlı kaçamaklar için ideal!',
  'Elektronik ürünlerimizde %15 indirim. Teknoloji dünyasını keşfedin!',
  'Günlük ihtiyaçlarınızda %12 indirim. Uygun fiyatlı alışveriş için bizi tercih edin!',
  'Moda ürünlerimizde %30 indirim. Trend kıyafetler için mağazamıza gelin!',
  'Geleneksel tatlılarımızda %22 indirim. Anadolu lezzetlerini deneyimleyin!',
  'Kahve ve kahvaltı ürünlerimizde %20 indirim. Güne lezzetli bir başlangıç yapın!'
];

// Banner görselleri (Unsplash)
const BANNER_IMAGES = [
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&h=600&fit=crop', // Burger
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=1200&h=600&fit=crop', // Dondurma
  'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=600&fit=crop', // Pizza
  'https://images.unsplash.com/photo-1556910096-6f5e72db6803?w=1200&h=600&fit=crop', // Market
  'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=1200&h=600&fit=crop', // Tavuk
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1200&h=600&fit=crop', // Elektronik
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=600&fit=crop', // Market
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=1200&h=600&fit=crop', // Tatlı
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=600&fit=crop'  // Kahve
];

// Kategoriye göre açılış-kapanış saatleri
const getWorkingHours = (category) => {
  switch (category) {
    case 'Kahve':
      return {
        monday: { open: '07:00', close: '23:00' },
        tuesday: { open: '07:00', close: '23:00' },
        wednesday: { open: '07:00', close: '23:00' },
        thursday: { open: '07:00', close: '23:00' },
        friday: { open: '07:00', close: '00:00' },
        saturday: { open: '08:00', close: '00:00' },
        sunday: { open: '08:00', close: '23:00' }
      };
    case 'Yiyecek':
      return {
        monday: { open: '10:00', close: '22:00' },
        tuesday: { open: '10:00', close: '22:00' },
        wednesday: { open: '10:00', close: '22:00' },
        thursday: { open: '10:00', close: '22:00' },
        friday: { open: '10:00', close: '23:00' },
        saturday: { open: '11:00', close: '23:00' },
        sunday: { open: '11:00', close: '22:00' }
      };
    case 'Giyim':
      return {
        monday: { open: '09:00', close: '20:00' },
        tuesday: { open: '09:00', close: '20:00' },
        wednesday: { open: '09:00', close: '20:00' },
        thursday: { open: '09:00', close: '20:00' },
        friday: { open: '09:00', close: '21:00' },
        saturday: { open: '10:00', close: '21:00' },
        sunday: { open: '10:00', close: '20:00' }
      };
    case 'Tatlı':
      return {
        monday: { open: '09:00', close: '22:00' },
        tuesday: { open: '09:00', close: '22:00' },
        wednesday: { open: '09:00', close: '22:00' },
        thursday: { open: '09:00', close: '22:00' },
        friday: { open: '09:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '22:00' }
      };
    case 'Market':
      return {
        monday: { open: '08:00', close: '22:00' },
        tuesday: { open: '08:00', close: '22:00' },
        wednesday: { open: '08:00', close: '22:00' },
        thursday: { open: '08:00', close: '22:00' },
        friday: { open: '08:00', close: '22:00' },
        saturday: { open: '08:00', close: '22:00' },
        sunday: { open: '09:00', close: '22:00' }
      };
    default:
      return {
        monday: { open: '09:00', close: '22:00' },
        tuesday: { open: '09:00', close: '22:00' },
        wednesday: { open: '09:00', close: '22:00' },
        thursday: { open: '09:00', close: '22:00' },
        friday: { open: '09:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '22:00' }
      };
  }
};

async function cleanAndCreateRealBanners() {
  try {
    // MongoDB'ye bağlan
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/faydana');
    
    console.log('🔗 MongoDB bağlantısı başarılı');

    // Test banner'larını sil (test içeren başlıklar veya belirli pattern'ler)
    console.log('🗑️  Test banner\'ları siliniyor...');
    const testPatterns = [
      /test/i,
      /Test/i,
      /TEST/i,
      /deneme/i,
      /Deneme/i,
      /örnek/i,
      /Örnek/i
    ];
    
    const allBanners = await Banner.find({});
    let deletedCount = 0;
    
    for (const banner of allBanners) {
      const title = banner.title || '';
      const description = banner.description || '';
      const isTest = testPatterns.some(pattern => 
        pattern.test(title) || pattern.test(description)
      );
      
      // Ayrıca eski test banner'ları da kontrol et
      if (isTest || 
          title.includes('Akşam Saatlerinde') ||
          title.includes('Öğle Menüsünde') ||
          title.includes('Hafta Sonu Özel') ||
          title.includes('Yeni Sezon') ||
          title.includes('Güzellik Paketi') ||
          title.includes('Spor Üyeliği') ||
          title.includes('El Sanatları') ||
          title.includes('Café Central') ||
          title.includes('Lezzet Sofrası') ||
          title.includes('Gece Kulübü') ||
          title.includes('Moda Evi') ||
          title.includes('Güzellik Salonu') ||
          title.includes('Fitness Center') ||
          title.includes('Tatlıcı') ||
          title.includes('Mobilya Mağazası') ||
          title.includes('El Sanatları Atölyesi') ||
          title.includes('İstiklal Market')) {
        await Banner.findByIdAndDelete(banner._id);
        deletedCount++;
        console.log(`  ✅ Silindi: ${title}`);
      }
    }
    
    console.log(`✅ Toplam ${deletedCount} test banner silindi`);

    // Restaurant'ları oluştur veya bul
    const restaurants = [];
    for (let i = 0; i < BRANDS.length; i++) {
      const brand = BRANDS[i];
      const location = SAMSUN_LOCATIONS[i];
      const workingHours = getWorkingHours(brand.category);
      
      let restaurant = await Restaurant.findOne({ name: brand.name });
      
      if (!restaurant) {
        restaurant = new Restaurant({
          name: brand.name,
          type: 'restaurant',
          address: {
            street: location.address,
            city: location.city,
            district: location.district,
            coordinates: {
              lat: location.lat,
              lng: location.lng
            }
          },
          contact: {
            phone: `0532${String(i + 1).padStart(7, '0')}`,
            email: `${brand.name.toLowerCase().replace(/\s+/g, '')}@example.com`
          },
          workingHours: workingHours,
          logo: brand.logo,
          description: `${brand.name} - ${brand.brandType}`,
          isActive: true
        });
        
        await restaurant.save();
        console.log(`✅ Restaurant oluşturuldu: ${brand.name} (${brand.category})`);
      } else {
        // Mevcut restaurant'ın bilgilerini güncelle
        restaurant.address = {
          street: location.address,
          city: location.city,
          district: location.district,
          coordinates: {
            lat: location.lat,
            lng: location.lng
          }
        };
        restaurant.workingHours = workingHours;
        restaurant.logo = brand.logo;
        await restaurant.save();
        console.log(`✅ Restaurant güncellendi: ${brand.name}`);
      }
      
      restaurants.push(restaurant);
    }

    // 15 adet banner oluştur
    console.log('\n📦 Banner\'lar oluşturuluyor...');
    const createdBanners = [];
    
    for (let i = 0; i < 15; i++) {
      const brand = BRANDS[i];
      const location = SAMSUN_LOCATIONS[i];
      const restaurant = restaurants[i];
      const workingHours = getWorkingHours(brand.category);
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // 30 gün sonra bitiyor
      
      // İndirim yüzdesini başlıktan çıkar
      const discountMatch = BANNER_TITLES[i].match(/%(\d+)/);
      const discountPercentage = discountMatch ? parseInt(discountMatch[1]) : 20;
      
      // Kampanya saatlerini çalışma saatlerine göre ayarla
      const campaignStartTime = workingHours.monday.open;
      const campaignEndTime = workingHours.friday.close; // En geç kapanış saati
      
      const banner = new Banner({
        restaurant: restaurant._id,
        title: BANNER_TITLES[i],
        description: BANNER_DESCRIPTIONS[i],
        aiGeneratedText: BANNER_DESCRIPTIONS[i],
        bannerImage: BANNER_IMAGES[i],
        menu: {
          link: null,
          image: null,
          images: []
        },
        campaign: {
          startDate: startDate,
          endDate: endDate,
          startTime: campaignStartTime,
          endTime: campaignEndTime,
          daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
          isActive: true
        },
        category: brand.category,
        bannerLocation: {
          city: location.city,
          district: location.district,
          address: location.address,
          coordinates: {
            latitude: location.lat,
            longitude: location.lng
          }
        },
        brandProfile: {
          logo: brand.logo,
          description: `${brand.name} - ${brand.brandType}`,
          category: brand.category,
          brandType: brand.brandType,
          email: `${brand.name.toLowerCase().replace(/\s+/g, '')}@example.com`,
          address: location.address,
          city: location.city,
          district: location.district
        },
        status: 'active',
        approvalStatus: 'approved', // Direkt onaylı olarak oluştur
        offerType: 'percentage',
        offerDetails: {
          discountPercentage: discountPercentage
        },
        codeQuota: {
          total: 100,
          used: 0,
          remaining: 100
        },
        codeSettings: {
          codeType: 'random',
          fixedCode: null
        },
        stats: {
          views: Math.floor(Math.random() * 500),
          clicks: Math.floor(Math.random() * 100),
          conversions: Math.floor(Math.random() * 50)
        },
        contentType: 'campaign'
      });

      await banner.save();
      createdBanners.push(banner);
      console.log(`  ✅ Banner oluşturuldu: ${BANNER_TITLES[i]} (${brand.name})`);
      console.log(`     Açılış: ${campaignStartTime}, Kapanış: ${campaignEndTime}`);
    }

    console.log(`\n🎉 İşlem tamamlandı!`);
    console.log(`   - ${deletedCount} test banner silindi`);
    console.log(`   - ${createdBanners.length} banner oluşturuldu`);
    console.log(`   - Tüm banner'lar onaylı durumda ve aktif`);
    console.log(`   - Banner görselleri ve marka logoları eklendi`);
    console.log(`   - Açılış-kapanış saatleri kategoriye göre ayarlandı`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

cleanAndCreateRealBanners();

