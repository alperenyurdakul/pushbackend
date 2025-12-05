const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Banner = require('../models/Banner');

// İstanbul koordinatları ve ilçeleri
const ISTANBUL_LOCATIONS = [
  { city: 'İstanbul', district: 'Kadıköy', address: 'Bağdat Caddesi No:123', lat: 40.9819, lng: 29.0246 },
  { city: 'İstanbul', district: 'Beşiktaş', address: 'Barbaros Bulvarı No:45', lat: 41.0430, lng: 29.0084 },
  { city: 'İstanbul', district: 'Şişli', address: 'Cumhuriyet Caddesi No:78', lat: 41.0602, lng: 28.9874 },
  { city: 'İstanbul', district: 'Beyoğlu', address: 'İstiklal Caddesi No:156', lat: 41.0369, lng: 28.9850 },
  { city: 'İstanbul', district: 'Üsküdar', address: 'Bulgurlu Mahallesi No:89', lat: 41.0214, lng: 29.0124 },
  { city: 'İstanbul', district: 'Bakırköy', address: 'Ataköy Marina No:234', lat: 40.9820, lng: 28.8560 },
  { city: 'İstanbul', district: 'Ataşehir', address: 'Barbaros Mahallesi No:67', lat: 40.9833, lng: 29.1164 },
  { city: 'İstanbul', district: 'Maltepe', address: 'Bağlarbaşı Caddesi No:145', lat: 40.9333, lng: 29.1500 },
  { city: 'İstanbul', district: 'Kartal', address: 'Yukarı Mahalle No:12', lat: 40.9100, lng: 29.1725 },
  { city: 'İstanbul', district: 'Pendik', address: 'Kurtköy Mahallesi No:56', lat: 40.8783, lng: 29.2353 },
  { city: 'İstanbul', district: 'Beylikdüzü', address: 'Yakuplu Mahallesi No:234', lat: 41.0000, lng: 28.6333 },
  { city: 'İstanbul', district: 'Avcılar', address: 'Merkez Mahallesi No:78', lat: 41.0167, lng: 28.7167 },
  { city: 'İstanbul', district: 'Zeytinburnu', address: 'Telsiz Mahallesi No:90', lat: 41.0000, lng: 28.9000 },
  { city: 'İstanbul', district: 'Fatih', address: 'Sultanahmet Meydanı No:1', lat: 41.0086, lng: 28.9802 },
  { city: 'İstanbul', district: 'Sarıyer', address: 'Büyükdere Caddesi No:345', lat: 41.1167, lng: 29.0500 }
];

// Gerçekçi marka isimleri ve kategoriler
const REAL_BRANDS = [
  { name: 'Starbucks Kadıköy', category: 'Kahve', brandType: 'Kafe' },
  { name: 'Burger King Beşiktaş', category: 'Yiyecek', brandType: 'Fast Food' },
  { name: 'Zara Şişli', category: 'Giyim', brandType: 'Mağaza' },
  { name: 'Mado Beyoğlu', category: 'Tatlı', brandType: 'Dondurma' },
  { name: 'LC Waikiki Üsküdar', category: 'Giyim', brandType: 'Mağaza' },
  { name: 'Gloria Jeans Bakırköy', category: 'Kahve', brandType: 'Kafe' },
  { name: 'Pizza Hut Ataşehir', category: 'Yiyecek', brandType: 'Restoran' },
  { name: 'Migros Maltepe', category: 'Market', brandType: 'Market' },
  { name: 'KFC Kartal', category: 'Yiyecek', brandType: 'Fast Food' },
  { name: 'Kahve Dünyası Pendik', category: 'Kahve', brandType: 'Kafe' },
  { name: 'Teknosa Beylikdüzü', category: 'Market', brandType: 'Elektronik' },
  { name: 'BIM Avcılar', category: 'Market', brandType: 'Market' },
  { name: 'Koton Zeytinburnu', category: 'Giyim', brandType: 'Mağaza' },
  { name: 'Saray Muhallebicisi Fatih', category: 'Tatlı', brandType: 'Tatlıcı' },
  { name: 'Café Nero Sarıyer', category: 'Kahve', brandType: 'Kafe' }
];

// Gerçekçi banner başlıkları
const REAL_BANNER_TITLES = [
  'Kahve Keyfi %25 İndirim',
  'Burger Menüde %30 İndirim',
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

// Gerçekçi banner açıklamaları
const REAL_BANNER_DESCRIPTIONS = [
  'Tüm kahve çeşitlerimizde ve atıştırmalıklarımızda %25 indirim fırsatı. Hemen gelin, keyifli anlar yaşayın!',
  'Seçili burger menülerimizde %30 indirim. Lezzet dolu burger deneyimi için bizi ziyaret edin!',
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

// Gerçek banner görselleri (Unsplash)
const REAL_BANNER_IMAGES = [
  'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&h=600&fit=crop', // Burger
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=1200&h=600&fit=crop', // Dondurma
  'https://images.unsplash.com/photo-1445205170230-053b83016050?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=600&fit=crop', // Pizza
  'https://images.unsplash.com/photo-1556910096-6f5e72db6803?w=1200&h=600&fit=crop', // Market
  'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=1200&h=600&fit=crop', // KFC
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&h=600&fit=crop', // Kahve
  'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=1200&h=600&fit=crop', // Elektronik
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=1200&h=600&fit=crop', // Market
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&h=600&fit=crop', // Giyim
  'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=1200&h=600&fit=crop', // Tatlı
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&h=600&fit=crop'  // Kahve
];

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
    for (let i = 0; i < REAL_BRANDS.length; i++) {
      const brand = REAL_BRANDS[i];
      const location = ISTANBUL_LOCATIONS[i];
      
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
          workingHours: {
            monday: { open: '09:00', close: '22:00' },
            tuesday: { open: '09:00', close: '22:00' },
            wednesday: { open: '09:00', close: '22:00' },
            thursday: { open: '09:00', close: '22:00' },
            friday: { open: '09:00', close: '23:00' },
            saturday: { open: '10:00', close: '23:00' },
            sunday: { open: '10:00', close: '22:00' }
          },
          logo: null,
          description: `${brand.name} - ${brand.brandType}`,
          isActive: true
        });
        
        await restaurant.save();
        console.log(`✅ Restaurant oluşturuldu: ${brand.name}`);
      } else {
        // Mevcut restaurant'ın adres bilgilerini güncelle
        restaurant.address = {
          street: location.address,
          city: location.city,
          district: location.district,
          coordinates: {
            lat: location.lat,
            lng: location.lng
          }
        };
        await restaurant.save();
        console.log(`✅ Restaurant güncellendi: ${brand.name}`);
      }
      
      restaurants.push(restaurant);
    }

    // 15 adet gerçek banner oluştur
    console.log('\n📦 Gerçek banner\'lar oluşturuluyor...');
    const createdBanners = [];
    
    for (let i = 0; i < 15; i++) {
      const brand = REAL_BRANDS[i];
      const location = ISTANBUL_LOCATIONS[i];
      const restaurant = restaurants[i];
      
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // 30 gün sonra bitiyor
      
      // İndirim yüzdesini başlıktan çıkar
      const discountMatch = REAL_BANNER_TITLES[i].match(/%(\d+)/);
      const discountPercentage = discountMatch ? parseInt(discountMatch[1]) : 20;
      
      const banner = new Banner({
        restaurant: restaurant._id,
        title: REAL_BANNER_TITLES[i],
        description: REAL_BANNER_DESCRIPTIONS[i],
        aiGeneratedText: REAL_BANNER_DESCRIPTIONS[i],
        bannerImage: REAL_BANNER_IMAGES[i],
        menu: {
          link: null,
          image: null,
          images: []
        },
        campaign: {
          startDate: startDate,
          endDate: endDate,
          startTime: '09:00',
          endTime: '23:00',
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
          logo: null,
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
      console.log(`  ✅ Banner oluşturuldu: ${REAL_BANNER_TITLES[i]} (${brand.name})`);
    }

    console.log(`\n🎉 İşlem tamamlandı!`);
    console.log(`   - ${deletedCount} test banner silindi`);
    console.log(`   - ${createdBanners.length} gerçek banner oluşturuldu`);
    console.log(`   - Tüm banner'lar onaylı durumda ve aktif`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Hata:', error);
    process.exit(1);
  }
}

cleanAndCreateRealBanners();

