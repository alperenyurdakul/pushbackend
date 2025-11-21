const axios = require('axios');
const cheerio = require('cheerio');

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error('HTML fetch hatası:', error.message);
    throw new Error(`Menü sayfası yüklenemedi: ${error.message}`);
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
 * Yaygın menü yapılarını tespit et ve parse et
 */
const parseMenuItems = ($, url) => {
  const items = [];
  
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
 * Ana scraping fonksiyonu
 */
const scrapeMenu = async (menuUrl) => {
  try {
    console.log(`🔍 Menü scraping başladı: ${menuUrl}`);
    
    // HTML'i çek
    const html = await fetchHTML(menuUrl);
    
    // Cheerio ile parse et
    const $ = cheerio.load(html);
    
    // Menü item'larını çıkar
    const items = parseMenuItems($, menuUrl);
    
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

