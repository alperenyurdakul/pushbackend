const axios = require('axios');
const cheerio = require('cheerio');
let puppeteer = null;

// Puppeteer'ı lazy load et (sadece gerektiğinde yükle)
const getPuppeteer = async () => {
  if (!puppeteer) {
    try {
      puppeteer = require('puppeteer');
    } catch (error) {
      console.warn('⚠️ Puppeteer yüklü değil, JavaScript render edilmiş sayfalar scrape edilemeyebilir');
      return null;
    }
  }
  return puppeteer;
};

/**
 * Menu Scraping Service
 * Farklı menü formatlarını destekler:
 * - HTML menüler (Cheerio ile)
 * - PDF menüler (gelecekte eklenebilir)
 * - JSON API'ler (gelecekte eklenebilir)
 */

/**
 * URL'den HTML içeriğini çek
 */
const fetchHTML = async (url) => {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    return response.data;
  } catch (error) {
    console.error('HTML fetch hatası:', error.message);
    throw new Error(`Menü sayfası yüklenemedi: ${error.message}`);
  }
};

/**
 * Sekiz Lounge gibi özel menü sistemleri için API endpoint'ini dene
 */
const tryAPIEndpoint = async (url) => {
  try {
    // URL'den category ID'yi çıkar
    const categoryMatch = url.match(/[?&]id=(\d+)/);
    if (!categoryMatch) return null;

    const categoryId = categoryMatch[1];
    const baseUrl = url.split('/category')[0];
    
    // Olası API endpoint'lerini dene
    const possibleEndpoints = [
      `${baseUrl}/api/category/${categoryId}`,
      `${baseUrl}/api/products?categoryId=${categoryId}`,
      `${baseUrl}/api/menu?categoryId=${categoryId}`,
      `${baseUrl}/api/category.html?id=${categoryId}&format=json`,
    ];

    for (const endpoint of possibleEndpoints) {
      try {
        const response = await axios.get(endpoint, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });
        
        if (response.data && typeof response.data === 'object') {
          console.log(`✅ API endpoint bulundu: ${endpoint}`);
          return response.data;
        }
      } catch (e) {
        // Bu endpoint çalışmadı, diğerini dene
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.log('API endpoint denemesi başarısız:', error.message);
    return null;
  }
};

/**
 * Fiyatı temizle ve sayıya çevir
 */
const parsePrice = (priceText) => {
  if (!priceText) return null;
  
  // Türk Lirası sembolleri ve metinleri temizle
  let cleaned = priceText.toString()
    .replace(/[^\d,.]/g, '') // Sadece rakam, nokta ve virgül bırak
    .replace(/\./g, '') // Binlik ayırıcıları kaldır
    .replace(',', '.'); // Virgülü noktaya çevir
  
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
};

/**
 * Sekiz Lounge menü formatını parse et
 */
const parseSekizLoungeMenu = ($, url) => {
  const items = [];
  
  // Sekiz Lounge özel formatı - script tag'lerinde JSON data olabilir
  $('script').each((i, script) => {
    const scriptContent = $(script).html();
    if (scriptContent && scriptContent.includes('product') || scriptContent.includes('menu')) {
      try {
        // JSON.parse edilebilir veri var mı?
        const jsonMatch = scriptContent.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          if (data.products || data.items || Array.isArray(data)) {
            const products = data.products || data.items || data;
            products.forEach(product => {
              if (product.name && product.price) {
                items.push({
                  name: product.name,
                  price: parseFloat(product.price) || parsePrice(product.price),
                  category: product.category || null,
                  description: product.description || null
                });
              }
            });
          }
        }
      } catch (e) {
        // JSON parse edilemedi, devam et
      }
    }
  });
  
  // Eğer script'lerden veri bulunamadıysa, data attribute'larına bak
  if (items.length === 0) {
    $('[data-product], [data-item], [data-name]').each((i, elem) => {
      const $elem = $(elem);
      const name = $elem.attr('data-name') || $elem.find('[data-name]').attr('data-name') || 
                   $elem.find('h1, h2, h3, h4, h5, h6, .name, .title').first().text().trim();
      const priceText = $elem.attr('data-price') || $elem.find('[data-price]').attr('data-price') ||
                       $elem.find('.price, .cost').first().text().trim();
      
      if (name && priceText) {
        const price = parsePrice(priceText);
        if (price && price > 0) {
          items.push({
            name: name,
            price: price,
            category: $elem.attr('data-category') || null,
            description: $elem.find('.description').first().text().trim() || null
          });
        }
      }
    });
  }
  
  return items;
};

/**
 * Yaygın menü yapılarını tespit et ve parse et
 */
const parseMenuItems = ($, url) => {
  const items = [];
  
  // Özel formatlar için önce kontrol et
  if (url.includes('sekizlounge.com')) {
    const sekizItems = parseSekizLoungeMenu($, url);
    if (sekizItems.length > 0) {
      return sekizItems;
    }
  }
  
  // Yöntem 1: Yemeksepeti, Getir gibi platformların formatı
  // class veya data attribute'larına göre
  $('[class*="menu"], [class*="item"], [class*="product"]').each((i, elem) => {
    const $elem = $(elem);
    const name = $elem.find('[class*="name"], [class*="title"], h3, h4').first().text().trim();
    const priceText = $elem.find('[class*="price"], [class*="cost"], [data-price]').first().text().trim() || 
                      $elem.attr('data-price') || 
                      $elem.find('span').filter((i, el) => {
                        const text = $(el).text();
                        return /₺|TL|tl/.test(text) || parsePrice(text) !== null;
                      }).first().text();
    
    if (name && priceText) {
      const price = parsePrice(priceText);
      if (price && price > 0) {
        items.push({
          name: name,
          price: price,
          category: $elem.closest('[class*="category"], [class*="section"]').find('h2, h3').first().text().trim() || null,
          description: $elem.find('[class*="description"], p').first().text().trim() || null
        });
      }
    }
  });
  
  // Yöntem 2: Tablo formatı menüler
  if (items.length === 0) {
    $('table tr').each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td, th');
      if (cells.length >= 2) {
        const name = cells.eq(0).text().trim();
        const priceText = cells.eq(1).text().trim() || cells.last().text().trim();
        const price = parsePrice(priceText);
        
        if (name && price && price > 0) {
          items.push({
            name: name,
            price: price,
            category: null,
            description: null
          });
        }
      }
    });
  }
  
  // Yöntem 3: Liste formatı (ul/li)
  if (items.length === 0) {
    $('ul li, ol li').each((i, li) => {
      const $li = $(li);
      const text = $li.text().trim();
      
      // Fiyat içeren satırları bul
      const priceMatch = text.match(/(\d+[.,]\d+|\d+)\s*(₺|TL|tl)/i);
      if (priceMatch) {
        const name = text.replace(priceMatch[0], '').trim();
        const price = parsePrice(priceMatch[0]);
        
        if (name && price && price > 0) {
          items.push({
            name: name,
            price: price,
            category: $li.closest('ul, ol').prev('h2, h3').text().trim() || null,
            description: null
          });
        }
      }
    });
  }
  
  // Yöntem 4: Div/span yapısı (genel)
  if (items.length === 0) {
    $('div, section').each((i, elem) => {
      const $elem = $(elem);
      const text = $elem.text().trim();
      
      // Fiyat içeren div'leri bul
      if (text.length > 5 && text.length < 200) {
        const priceMatch = text.match(/(\d+[.,]\d+|\d+)\s*(₺|TL|tl)/i);
        if (priceMatch) {
          const name = text.replace(priceMatch[0], '').trim();
          const price = parsePrice(priceMatch[0]);
          
          if (name && price && price > 0 && name.length > 2) {
            // Duplicate kontrolü
            const exists = items.some(item => 
              item.name.toLowerCase() === name.toLowerCase() || 
              Math.abs(item.price - price) < 0.01
            );
            
            if (!exists) {
              items.push({
                name: name,
                price: price,
                category: null,
                description: null
              });
            }
          }
        }
      }
    });
  }
  
  return items;
};

/**
 * Puppeteer ile JavaScript render edilmiş sayfayı scrape et
 */
const scrapeWithPuppeteer = async (menuUrl) => {
  const puppeteerInstance = await getPuppeteer();
  if (!puppeteerInstance) {
    return null;
  }

  let browser = null;
  try {
    console.log('🌐 Puppeteer ile sayfa yükleniyor...');
    
    browser = await puppeteerInstance.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Sayfayı yükle ve JavaScript'in çalışmasını bekle
    await page.goto(menuUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    // Ekstra bekleme (bazı sayfalar için)
    await page.waitForTimeout(3000);

    // Sayfa içeriğini al
    const html = await page.content();
    
    // Cheerio ile parse et
    const $ = cheerio.load(html);
    
    // Menü item'larını çıkar
    let items = parseMenuItems($, menuUrl);
    
    // Eğer hala bulunamadıysa, JavaScript'ten direkt veri çekmeyi dene
    if (items.length === 0) {
      try {
        // Sayfadaki window objesinden veri çekmeyi dene
        const pageData = await page.evaluate(() => {
          // Sekiz Lounge özel formatı
          if (window.products || window.menuData || window.categoryData) {
            return window.products || window.menuData || window.categoryData;
          }
          
          // React/Vue component state'lerinden veri çekmeyi dene
          if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            // React component tree'den veri çek
            return null;
          }
          
          // DOM'dan direkt veri çek
          const productElements = document.querySelectorAll('[data-product], [data-item], .product, .menu-item');
          const products = [];
          
          productElements.forEach(el => {
            const name = el.getAttribute('data-name') || 
                        el.querySelector('.name, .title, h1, h2, h3, h4')?.textContent?.trim();
            const priceText = el.getAttribute('data-price') || 
                             el.querySelector('.price, .cost')?.textContent?.trim();
            
            if (name && priceText) {
              products.push({ name, price: priceText });
            }
          });
          
          return products.length > 0 ? products : null;
        });
        
        if (pageData) {
          if (Array.isArray(pageData)) {
            items = pageData.map(item => ({
              name: item.name || item.title || item.productName,
              price: parseFloat(item.price) || parsePrice(item.price),
              category: item.category || item.categoryName || null,
              description: item.description || null
            })).filter(item => item.name && item.price > 0);
          }
        }
      } catch (e) {
        console.log('JavaScript veri çekme hatası:', e.message);
      }
    }
    
    await browser.close();
    
    if (items.length > 0) {
      console.log(`✅ Puppeteer ile ${items.length} ürün bulundu`);
      return items;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Puppeteer scraping hatası:', error.message);
    if (browser) {
      await browser.close();
    }
    return null;
  }
};

/**
 * Ana scraping fonksiyonu
 */
const scrapeMenu = async (menuUrl) => {
  try {
    console.log(`🔍 Menü scraping başladı: ${menuUrl}`);
    
    // Önce API endpoint'ini dene (Sekiz Lounge gibi özel sistemler için)
    const apiData = await tryAPIEndpoint(menuUrl);
    if (apiData) {
      // API'den gelen veriyi parse et
      let items = [];
      
      if (Array.isArray(apiData)) {
        items = apiData.map(item => ({
          name: item.name || item.title || item.productName,
          price: parseFloat(item.price) || parsePrice(item.price),
          category: item.category || item.categoryName || null,
          description: item.description || null
        })).filter(item => item.name && item.price > 0);
      } else if (apiData.products || apiData.items) {
        const products = apiData.products || apiData.items;
        items = products.map(item => ({
          name: item.name || item.title || item.productName,
          price: parseFloat(item.price) || parsePrice(item.price),
          category: item.category || item.categoryName || null,
          description: item.description || null
        })).filter(item => item.name && item.price > 0);
      }
      
      if (items.length > 0) {
        console.log(`✅ API'den ${items.length} ürün bulundu`);
        return {
          success: true,
          items: items,
          totalItems: items.length,
          averagePrice: items.reduce((sum, item) => sum + item.price, 0) / items.length,
          minPrice: Math.min(...items.map(item => item.price)),
          maxPrice: Math.max(...items.map(item => item.price))
        };
      }
    }
    
    // API çalışmadıysa önce normal HTML scraping yap
    let items = [];
    try {
      const html = await fetchHTML(menuUrl);
      const $ = cheerio.load(html);
      items = parseMenuItems($, menuUrl);
    } catch (error) {
      console.log('Normal HTML scraping başarısız, Puppeteer deneniyor...');
    }
    
    // Eğer normal scraping başarısız olduysa Puppeteer kullan
    if (items.length === 0) {
      console.log('🌐 JavaScript render edilmiş sayfa tespit edildi, Puppeteer kullanılıyor...');
      const puppeteerItems = await scrapeWithPuppeteer(menuUrl);
      if (puppeteerItems && puppeteerItems.length > 0) {
        items = puppeteerItems;
      }
    }
    
    // Son çare: Sayfadaki tüm metin içeriğini tarayarak fiyat pattern'lerini bul
    if (items.length === 0) {
      try {
        const html = await fetchHTML(menuUrl);
        const $ = cheerio.load(html);
        const bodyText = $('body').text();
        const pricePattern = /([A-Za-zığüşöçİĞÜŞÖÇ\s]+?)\s*(\d+[.,]\d+|\d+)\s*(₺|TL|tl)/gi;
        const matches = [...bodyText.matchAll(pricePattern)];
        
        for (const match of matches) {
          const name = match[1].trim();
          const priceText = match[2];
          const price = parsePrice(priceText);
          
          if (name.length > 2 && name.length < 100 && price && price > 0) {
            // Duplicate kontrolü
            const exists = items.some(item => 
              item.name.toLowerCase() === name.toLowerCase()
            );
            
            if (!exists) {
              items.push({
                name: name,
                price: price,
                category: null,
                description: null
              });
            }
          }
        }
      } catch (e) {
        // Son çare de başarısız
      }
    }
    
    if (items.length === 0) {
      throw new Error('Menüden hiçbir ürün bulunamadı. Menü formatı desteklenmiyor olabilir.');
    }
    
    console.log(`✅ ${items.length} ürün bulundu`);
    
    return {
      success: true,
      items: items,
      totalItems: items.length,
      averagePrice: items.reduce((sum, item) => sum + item.price, 0) / items.length,
      minPrice: Math.min(...items.map(item => item.price)),
      maxPrice: Math.max(...items.map(item => item.price))
    };
  } catch (error) {
    console.error('❌ Scraping hatası:', error);
    return {
      success: false,
      error: error.message,
      items: []
    };
  }
};

/**
 * Fiyat değişikliklerini tespit et
 */
const detectPriceChanges = (oldItems, newItems) => {
  const changes = [];
  const oldItemsMap = new Map(oldItems.map(item => [item.name.toLowerCase(), item.price]));
  
  newItems.forEach(newItem => {
    const oldPrice = oldItemsMap.get(newItem.name.toLowerCase());
    if (oldPrice && oldPrice !== newItem.price) {
      changes.push({
        itemName: newItem.name,
        oldPrice: oldPrice,
        newPrice: newItem.price,
        change: newItem.price - oldPrice,
        changePercent: ((newItem.price - oldPrice) / oldPrice * 100).toFixed(2)
      });
    }
  });
  
  return changes;
};

module.exports = {
  scrapeMenu,
  detectPriceChanges
};

