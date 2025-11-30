/**
 * İçerik Moderasyonu Yardımcı Fonksiyonları
 * Küfür, siyaset ve uygunsuz içerik filtreleme
 */

// Türkçe küfür ve uygunsuz kelimeler listesi
// NOT: Bu liste örnek amaçlıdır. Gerçek kullanımda daha kapsamlı bir liste kullanılmalıdır.
// Ayrıca, hassas içerik için AI tabanlı moderasyon (OpenAI Moderation API) önerilir.
const PROFANITY_WORDS = [
  // Yaygın küfürler (örnek - gerçek liste daha kapsamlı olmalı)
  // Bu liste sadece örnek amaçlıdır, gerçek kullanımda genişletilmelidir
];

// Siyasi içerik anahtar kelimeleri
const POLITICAL_KEYWORDS = [
  'parti', 'seçim', 'oy', 'milletvekili', 'başkan', 'cumhurbaşkanı',
  'bakan', 'hükümet', 'muhalefet', 'iktidar', 'siyaset', 'politika',
  'referandum', 'seçmen', 'aday', 'kampanya'
];

// Spam içerik kalıpları
const SPAM_PATTERNS = [
  /http[s]?:\/\/[^\s]+/gi, // URL'ler
  /www\.[^\s]+/gi,
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, // Email'ler
  /0?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/gi, // Telefon numaraları
];

/**
 * İçeriği kontrol et ve risk seviyesini belirle
 * @param {string} content - Kontrol edilecek içerik
 * @returns {Object} { isSafe: boolean, riskLevel: 'low'|'medium'|'high', reasons: string[] }
 */
function moderateContent(content) {
  if (!content || typeof content !== 'string') {
    return {
      isSafe: false,
      riskLevel: 'high',
      reasons: ['İçerik boş veya geçersiz']
    };
  }

  const normalizedContent = content.toLowerCase().trim();
  const reasons = [];
  let riskLevel = 'low';

  // 1. Küfür kontrolü
  const hasProfanity = PROFANITY_WORDS.some(word => 
    normalizedContent.includes(word.toLowerCase())
  );
  if (hasProfanity) {
    reasons.push('Küfür içeriyor');
    riskLevel = 'high';
  }

  // 2. Siyasi içerik kontrolü
  const hasPoliticalContent = POLITICAL_KEYWORDS.some(keyword =>
    normalizedContent.includes(keyword.toLowerCase())
  );
  if (hasPoliticalContent) {
    reasons.push('Siyasi içerik tespit edildi');
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  // 3. Spam kontrolü
  const hasSpam = SPAM_PATTERNS.some(pattern => pattern.test(content));
  if (hasSpam) {
    reasons.push('Spam içerik tespit edildi (URL, email, telefon)');
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  // 4. Çok kısa veya çok uzun içerik
  if (normalizedContent.length < 5) {
    reasons.push('İçerik çok kısa');
    riskLevel = 'medium';
  }
  if (normalizedContent.length > 1000) {
    reasons.push('İçerik çok uzun');
    riskLevel = 'medium';
  }

  // 5. Tekrarlayan karakterler (spam göstergesi)
  const repeatedChars = /(.)\1{4,}/gi.test(content);
  if (repeatedChars) {
    reasons.push('Tekrarlayan karakterler tespit edildi');
    riskLevel = riskLevel === 'high' ? 'high' : 'medium';
  }

  return {
    isSafe: riskLevel === 'low',
    riskLevel,
    reasons: reasons.length > 0 ? reasons : ['İçerik güvenli görünüyor']
  };
}

/**
 * İçeriği temizle (basit temizleme)
 * @param {string} content - Temizlenecek içerik
 * @returns {string} Temizlenmiş içerik
 */
function sanitizeContent(content) {
  if (!content) return '';
  
  // HTML tag'lerini temizle
  let cleaned = content.replace(/<[^>]*>/g, '');
  
  // Fazla boşlukları temizle
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

module.exports = {
  moderateContent,
  sanitizeContent,
  PROFANITY_WORDS,
  POLITICAL_KEYWORDS
};

