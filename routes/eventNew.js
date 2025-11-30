const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Event = require('../models/Event');
const User = require('../models/User');
const EventReview = require('../models/EventReview');
const EventQuestion = require('../models/EventQuestion');
const { moderateContent, sanitizeContent } = require('../utils/contentModeration');
const multer = require('multer');
const path = require('path');
const uploadS3 = require('../middleware/uploadS3');
const { uploadBase64ToS3 } = require('../middleware/uploadS3');
const OneSignalService = require('../services/oneSignalService');
const OneSignal = require('onesignal-node');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// OneSignal Configuration - Mobil uygulama ile aynı!
const ONESIGNAL_APP_ID = 'e4150da6-cd3a-44f2-a193-254898ba5129';
const ONESIGNAL_REST_API_KEY = 'os_v2_app_4qkq3jwnhjcpfimtevejrosrfgk3cootom3eka5lq4krwp7mlpn5r7l3cnpga527qmrmqxwgcizwuvibjfyj2bwbg3ebp63njyrp6pa';

const client = new OneSignal.Client(ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY);

// OneSignal v2 API için direkt HTTP istek fonksiyonu
async function sendNotificationV2(notification) {
  try {
    console.log('📲 OneSignal V2 API ile bildirim gönderiliyor...');
    const response = await axios.post('https://api.onesignal.com/notifications', notification, {
      headers: {
        'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    console.log('✅ OneSignal V2 bildirimi başarıyla gönderildi!');
    return response.data;
  } catch (error) {
    console.error('❌ OneSignal V2 bildirim hatası:', error.response?.data || error.message);
    throw error;
  }
}

// Middleware - JWT token kontrolü
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token gerekli' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Token geçersiz' });
  }
};

// Middleware - Admin kontrolü
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin yetkisi gerekli' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
};

// ========== ETKINLIK OLUŞTURMA ==========
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, startDate, endDate, location, address, participantLimit, bannerImage } = req.body;
    
    // Kullanıcı bilgilerini al
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }
    
    // Görsel yükle (base64 ise S3'e yükle)
    let bannerImageUrl = null;
    if (bannerImage && bannerImage.startsWith('data:image/')) {
      try {
        console.log('📤 Event banner görseli S3e yükleniyor...');
        bannerImageUrl = await uploadBase64ToS3(bannerImage, 'events');
        console.log('✅ Event banner görseli yüklendi:', bannerImageUrl);
      } catch (uploadError) {
        console.error('❌ Event banner görseli yükleme hatası:', uploadError);
        // Görsel yükleme hatası etkinlik oluşturmayı engellemesin
        bannerImageUrl = null;
      }
    } else if (bannerImage && (bannerImage.startsWith('http://') || bannerImage.startsWith('https://'))) {
      bannerImageUrl = bannerImage;
      console.log('✅ Event banner görseli zaten URL:', bannerImageUrl);
    } else if (bannerImage) {
      console.warn('⚠️ Event banner görseli formatı beklenmiyor:', typeof bannerImage, bannerImage?.substring(0, 50));
    }
    
    const eventData = {
      organizerId: user._id,
      organizerName: user.name,
      organizerProfilePhoto: user.profilePhoto,
      title,
      description,
      category,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      location,
      address: address || {},
      participantLimit: participantLimit ? parseInt(participantLimit) : null,
      bannerImage: bannerImageUrl,
      approvalStatus: 'pending', // Admin onayı için pending
      status: 'upcoming'
    };
    
    const newEvent = new Event(eventData);
    await newEvent.save();
    
    console.log('✅ Etkinlik oluşturuldu:', {
      eventId: newEvent._id,
      title: newEvent.title,
      bannerImage: newEvent.bannerImage,
      bannerImageUrl: bannerImageUrl
    });
    
    res.json({
      success: true,
      message: 'Etkinlik başarıyla oluşturuldu. Admin onayından sonra yayınlanacak.',
      event: newEvent
    });
  } catch (error) {
    console.error('Etkinlik oluşturma hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlik oluşturulurken hata oluştu' });
  }
});

// ========== ONAY BEKLEYEN ETKINLIKLER (ADMIN) ==========
router.get('/pending', authenticateToken, isAdmin, async (req, res) => {
  try {
    const events = await Event.find({ approvalStatus: 'pending' })
      .sort({ createdAt: -1 })
      .populate('organizerId', 'name phone email');
    
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Bekleyen etkinlikler hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// ========== ADMIN ONAY/RED ==========
router.put('/approve/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { approved } = req.body; // true veya false
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    if (approved) {
      event.approvalStatus = 'approved';
      event.approvedAt = new Date();
      event.status = 'upcoming';
      
      // OneSignal bildirimi gönder
      try {
        const notification = {
          app_id: ONESIGNAL_APP_ID,
          headings: { en: '🎉 Yeni Etkinlik!' },
          contents: { en: `${event.title} - ${event.description}` },
          data: { eventId: event._id.toString(), type: 'event' },
          included_segments: ['All'],
        };
        await client.createNotification(notification);
        console.log('✅ Etkinlik onay bildirimi gönderildi');
      } catch (error) {
        console.error('❌ OneSignal bildirim hatası:', error);
      }
    } else {
      event.approvalStatus = 'rejected';
      event.rejectedAt = new Date();
      event.rejectedReason = req.body.reason || 'Admin tarafından reddedildi';
    }
    
    await event.save();
    
    res.json({
      success: true,
      message: approved ? 'Etkinlik onaylandı' : 'Etkinlik reddedildi',
      event
    });
  } catch (error) {
    console.error('Etkinlik onaylama hatası:', error);
    res.status(500).json({ success: false, message: 'Onay işlemi başarısız' });
  }
});

// ========== ONAYLI ETKINLIKLERI GETIR (HERKES) ==========
router.get('/approved', async (req, res) => {
  try {
    const events = await Event.find({ 
      approvalStatus: 'approved',
      status: { $in: ['upcoming', 'ongoing'] }
    })
      .sort({ startDate: 1 })
      .limit(50);
    
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Etkinlikler getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// ========== ETKINLIK DETAY ==========
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('participants.userId', 'name phone profilePhoto');
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Etkinlik detay hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlik detayı getirilirken hata oluştu' });
  }
});

// ========== ETKINLIĞE BAŞVUR ==========
router.post('/:id/apply', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    const user = await User.findById(req.userId);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    if (event.approvalStatus !== 'approved') {
      return res.status(400).json({ success: false, message: 'Bu etkinlik henüz onaylanmamış' });
    }
    
    // Daha önce başvurmuş mu kontrol et
    const existingApplication = event.participants.find(
      p => p.userId.toString() === user._id.toString()
    );
    
    if (existingApplication) {
      return res.status(400).json({ 
        success: false, 
        message: existingApplication.status === 'approved' 
          ? 'Bu etkinliğe zaten katıldınız' 
          : 'Başvurunuz bekliyor'
      });
    }
    
    // Katılımcı limiti kontrol et
    if (event.participantLimit) {
      const approvedCount = event.participants.filter(p => p.status === 'approved').length;
      if (approvedCount >= event.participantLimit) {
        return res.status(400).json({ success: false, message: 'Etkinlik kontenjanı doldu' });
      }
    }
    
    // QR kod ve 6 haneli sayısal kod oluştur
    const qrCode = event.generateQRCode(user._id);
    const simpleCode = event.generateSimpleCode(user._id);
    
    console.log('🎫 Kodlar oluşturuldu:', { qrCode, simpleCode });
    
    event.participants.push({
      userId: user._id,
      userName: user.name,
      userProfilePhoto: user.profilePhoto,
      phone: user.phone,
      status: 'pending',
      qrCode,
      simpleCode
    });
    
    await event.save();
    
    // Organizatöre bildirim gönder
    try {
      const organizer = await User.findById(event.organizerId);
      if (organizer && organizer.oneSignalExternalId) {
        console.log('📲 Organizatöre katılma isteği bildirimi gönderiliyor...');
        
        await OneSignalService.sendToUser(
          organizer.oneSignalExternalId,
          '🎉 Yeni Katılım İsteği!',
          `${user.name}, "${event.title}" etkinliğinize katılmak istiyor.`,
          {
            type: 'new_participant_request',
            eventId: event._id.toString(),
            eventTitle: event.title,
            participantName: user.name,
            participantId: user._id.toString()
          }
        );
        
        console.log('✅ Organizatöre bildirim gönderildi!');
      } else {
        console.log('⚠️ Organizatör OneSignal ID bulunamadı');
      }
    } catch (notifError) {
      console.error('❌ Organizatöre bildirim gönderme hatası:', notifError);
      // Bildirim hatası başvuruyu etkilemesin
    }
    
    res.json({
      success: true,
      message: 'Başvurunuz gönderildi. Organizatör onayından sonra katılımınız onaylanacak.',
      participant: event.participants[event.participants.length - 1]
    });
  } catch (error) {
    console.error('Başvuru hatası:', error);
    res.status(500).json({ success: false, message: 'Başvuru işlemi başarısız' });
  }
});

// ========== KATILIMCI ONAY/RED (ORGANIZATOR) ==========
router.put('/:id/participant/:participantId/approve', authenticateToken, async (req, res) => {
  try {
    const { approved } = req.body;
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    // Organizatör kontrolü
    if (event.organizerId.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' });
    }
    
    const participant = event.participants.id(req.params.participantId);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Katılımcı bulunamadı' });
    }
    
    if (approved) {
      participant.status = 'approved';
      participant.approvedAt = new Date();
    } else {
      participant.status = 'rejected';
    }
    
    await event.save();
    
    // OneSignal bildirimi gönder
    try {
      // Katılımcı kullanıcısını bul
      const participantUserId = participant.userId._id || participant.userId;
      console.log('🔍 Katılımcı bildirimi için kullanıcı aranıyor:', participantUserId);
      
      const participantUser = await User.findById(participantUserId);
      
      if (participantUser && participantUser.oneSignalPlayerId) {
        console.log('✅ Kullanıcı bulundu, Player ID:', participantUser.oneSignalPlayerId);
        
        const notification = {
          app_id: ONESIGNAL_APP_ID,
          headings: { 
            en: approved ? '✅ Etkinlik Başvurunuz Onaylandı!' : '❌ Etkinlik Başvurunuz Reddedildi'
          },
          contents: { 
            en: approved 
              ? `"${event.title}" etkinliğine katılımınız onaylandı! Etkinlik günü QR kodunuzu göstermeyi unutmayın.`
              : `"${event.title}" etkinliğine katılım başvurunuz maalesef reddedildi.`
          },
          data: { 
            eventId: event._id.toString(), 
            type: 'event_participation',
            approved: approved
          },
          include_player_ids: [participantUser.oneSignalPlayerId]
        };
        
        console.log('📲 Bildirim gönderiliyor:', {
          to: participantUser.name,
          playerId: participantUser.oneSignalPlayerId,
          approved
        });
        
        await sendNotificationV2(notification);
        console.log('✅ Katılımcı onay bildirimi gönderildi!');
      } else {
        console.log('⚠️ Kullanıcı bulunamadı veya OneSignal Player ID yok');
      }
    } catch (notifError) {
      console.error('❌ Bildirim gönderme hatası:', notifError);
      // Bildirim hatası ana işlemi etkilemesin
    }
    
    res.json({
      success: true,
      message: approved ? 'Katılımcı onaylandı' : 'Katılımcı reddedildi'
    });
  } catch (error) {
    console.error('Katılımcı onaylama hatası:', error);
    res.status(500).json({ success: false, message: 'Onay işlemi başarısız' });
  }
});

// ========== BAŞVURUYU GERI ÇEK ==========
router.delete('/:id/apply', authenticateToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    const user = await User.findById(req.userId);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    const participantIndex = event.participants.findIndex(
      p => p.userId.toString() === user._id.toString()
    );
    
    if (participantIndex === -1) {
      return res.status(400).json({ success: false, message: 'Başvuru bulunamadı' });
    }
    
    // Onaylanmış başvuruyu iptal etme (QR kodla katıldıysa)
    if (event.participants[participantIndex].status === 'approved') {
      return res.status(400).json({ 
        success: false, 
        message: 'Onaylanmış başvurunuzu iptal edemezsiniz. Etkinlik başladıktan sonra QR kodunuzu kullanarak katılacaksınız.' 
      });
    }
    
    event.participants.splice(participantIndex, 1);
    await event.save();
    
    res.json({
      success: true,
      message: 'Başvurunuz geri çekildi'
    });
  } catch (error) {
    console.error('Başvuru iptal hatası:', error);
    res.status(500).json({ success: false, message: 'Başvuru iptali başarısız' });
  }
});

// ========== QR KOD DOĞRULAMA ==========
router.post('/:id/qr-verify', authenticateToken, async (req, res) => {
  try {
    const { qrCode } = req.body;
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    // Organizatör kontrolü
    if (event.organizerId.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok' });
    }
    
    // Hem QR kod hem de 6 haneli kod ile arama yap
    const participant = event.participants.find(p => 
      p.qrCode === qrCode || p.simpleCode === qrCode
    );
    
    console.log('🔍 Kod doğrulama:', {
      inputCode: qrCode,
      foundParticipant: !!participant,
      participantName: participant?.userName
    });
    
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Geçersiz kod' });
    }
    
    if (participant.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Bu başvuru onaylı değil' });
    }
    
    if (participant.qrVerifiedAt) {
      return res.status(400).json({ success: false, message: 'Bu QR kod zaten kullanılmış' });
    }
    
    // Etkinlik başladı mı kontrol et
    if (new Date() < event.startDate) {
      return res.status(400).json({ success: false, message: 'Etkinlik henüz başlamadı' });
    }
    
    participant.status = 'attended';
    participant.attendedAt = new Date();
    participant.qrVerifiedAt = new Date();
    
    await event.save();
    
    // Kullanıcının istatistiklerini güncelle
    const participantUserId = participant.userId?._id || participant.userId;
    if (participantUserId) {
      const participantUser = await User.findById(participantUserId);
      if (participantUser) {
        participantUser.statistics.attendedEventsCount = (participantUser.statistics.attendedEventsCount || 0) + 1;
        await participantUser.save();
      }
    }
    
    res.json({
      success: true,
      message: `${participant.userName} başarıyla katılım olarak işaretlendi`,
      participant
    });
  } catch (error) {
    console.error('QR doğrulama hatası:', error);
    res.status(500).json({ success: false, message: 'QR doğrulama başarısız' });
  }
});

// ========== ORGANIZATÖRÜN ETKINLIKLERI ==========
router.get('/my-events/created', authenticateToken, async (req, res) => {
  try {
    const events = await Event.find({ organizerId: req.userId })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Etkinlikler getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// ========== KULLANICININ KATILDIĞI ETKINLIKLER ==========
router.get('/my-events/participating', authenticateToken, async (req, res) => {
  try {
    const events = await Event.find({ 
      'participants.userId': req.userId,
      'participants.status': { $in: ['approved', 'attended'] }
    })
      .sort({ startDate: 1 });
    
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Katılımcı etkinlikler hatası:', error);
    res.status(500).json({ success: false, message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// ========== EVENT REVIEW ENDPOINTS ==========

// Post event review
router.post('/:id/review', authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const event = await Event.findById(req.params.id);
    const user = await User.findById(req.userId);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Etkinlik bulunamadı' });
    }
    
    // Sadece etkinliğe katılmış (attended) kullanıcılar yorum yapabilir
    const participant = event.participants.find(p => {
      const userId = p.userId._id || p.userId.id || p.userId;
      return userId.toString() === user._id.toString() && p.status === 'attended';
    });
    
    if (!participant) {
      return res.status(403).json({ success: false, message: 'Sadece etkinliğe katılan kullanıcılar yorum yapabilir' });
    }
    
    // Daha önce yorum yapmış mı kontrol et
    const existingReview = await EventReview.findOne({
      event: event._id,
      user: user._id
    });
    
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'Bu etkinlik için zaten yorum yaptınız' });
    }
    
    // Yorum oluştur
    const review = new EventReview({
      event: event._id,
      organizerId: event.organizerId,
      eventTitle: event.title,
      eventDescription: event.description,
      user: user._id,
      userPhone: user.phone,
      userName: user.name,
      userProfilePhoto: user.profilePhoto,
      rating: parseInt(rating),
      comment: comment || '',
      status: 'approved'
    });
    
    await review.save();
    
    res.json({
      success: true,
      message: 'Yorumunuz başarıyla eklendi',
      review
    });
  } catch (error) {
    console.error('Yorum ekleme hatası:', error);
    res.status(500).json({ success: false, message: 'Yorum eklenirken hata oluştu' });
  }
});

// Get event reviews
router.get('/:id/reviews', async (req, res) => {
  try {
    const reviews = await EventReview.find({
      event: req.params.id,
      status: 'approved'
    })
      .populate('user', 'name phone profilePhoto')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error('Yorumlar getirme hatası:', error);
    res.status(500).json({ success: false, message: 'Yorumlar getirilirken hata oluştu' });
  }
});

// Get organizer's event reviews (for profile history)
router.get('/organizer/:organizerId/reviews', async (req, res) => {
  try {
    const reviews = await EventReview.find({
      organizerId: req.params.organizerId,
      status: 'approved'
    })
      .populate('user', 'name phone profilePhoto')
      .populate('event')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error('Organizer yorumları hatası:', error);
    res.status(500).json({ success: false, message: 'Yorumlar getirilirken hata oluştu' });
  }
});

// ========== SCRAPING ENDPOINT (n8n için) ==========
// API Key ile korumalı endpoint - scraping servisleri için
router.post('/create-from-scraper', async (req, res) => {
  try {
    // API Key kontrolü
    const apiKey = req.headers['x-api-key'] || req.body.apiKey;
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || 'your-scraper-api-key-here';
    
    if (apiKey !== SCRAPER_API_KEY) {
      return res.status(401).json({ 
        success: false, 
        message: 'Geçersiz API key' 
      });
    }
    
    const { 
      title, 
      description, 
      category, 
      startDate, 
      endDate, 
      location, 
      address, 
      bannerImage,
      sourceUrl, // Hangi siteden çekildiği
      sourceName // Kaynak site adı (biletix, eventbrite, vb.)
    } = req.body;
    
    // Zorunlu alanlar kontrolü
    if (!title || !description || !category || !startDate || !endDate || !location) {
      return res.status(400).json({ 
        success: false, 
        message: 'Eksik alanlar: title, description, category, startDate, endDate, location zorunludur' 
      });
    }
    
    // Scraper için özel bir kullanıcı oluştur veya bul
    let scraperUser = await User.findOne({ phone: 'scraper@faydana.com' });
    if (!scraperUser) {
      scraperUser = new User({
        phone: 'scraper@faydana.com',
        password: 'scraper-password-' + Date.now(), // Rastgele şifre
        name: 'Event Scraper',
        userType: 'eventBrand',
        email: 'scraper@faydana.com'
      });
      await scraperUser.save();
      console.log('✅ Scraper kullanıcısı oluşturuldu');
    }
    
    // Görsel yükle (base64 veya URL)
    let bannerImageUrl = null;
    if (bannerImage) {
      if (bannerImage.startsWith('data:image/')) {
        try {
          bannerImageUrl = await uploadBase64ToS3(bannerImage, 'events');
          console.log('✅ Scraped event banner görseli yüklendi:', bannerImageUrl);
        } catch (uploadError) {
          console.error('❌ Banner görseli yükleme hatası:', uploadError);
        }
      } else if (bannerImage.startsWith('http://') || bannerImage.startsWith('https://')) {
        bannerImageUrl = bannerImage;
      }
    }
    
    // Adres bilgilerini parse et
    let parsedAddress = {};
    if (address) {
      if (typeof address === 'string') {
        // String ise parse etmeye çalış
        parsedAddress = { street: address };
      } else {
        parsedAddress = address;
      }
    }
    
    const eventData = {
      organizerId: scraperUser._id,
      organizerName: `Scraper - ${sourceName || 'Unknown'}`,
      organizerProfilePhoto: null,
      title,
      description,
      category,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      location,
      address: parsedAddress,
      participantLimit: null,
      bannerImage: bannerImageUrl,
      approvalStatus: 'pending', // Admin onayı gerekli
      status: 'upcoming',
      // Scraping metadata
      sourceUrl: sourceUrl || null,
      sourceName: sourceName || 'Scraper'
    };
    
    // Duplicate kontrolü - aynı başlık ve tarih varsa ekleme
    const existingEvent = await Event.findOne({
      title: title,
      startDate: new Date(startDate),
      'address.city': parsedAddress.city || address?.city
    });
    
    if (existingEvent) {
      console.log('⚠️ Duplicate event bulundu, atlanıyor:', title);
      return res.json({
        success: true,
        message: 'Etkinlik zaten mevcut (duplicate)',
        event: existingEvent,
        duplicate: true
      });
    }
    
    const newEvent = new Event(eventData);
    await newEvent.save();
    
    console.log('✅ Scraped event oluşturuldu:', {
      eventId: newEvent._id,
      title: newEvent.title,
      source: sourceName,
      approvalStatus: 'pending'
    });
    
    res.json({
      success: true,
      message: 'Etkinlik başarıyla oluşturuldu. Admin onayından sonra yayınlanacak.',
      event: newEvent
    });
  } catch (error) {
    console.error('❌ Scraped event oluşturma hatası:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Etkinlik oluşturulurken hata oluştu',
      error: error.message 
    });
  }
});

// ========== SORU-CEVAP ENDPOINT'LERİ ==========

/**
 * POST /api/event/:eventId/questions
 * Etkinlik için soru sor
 */
router.post('/:eventId/questions', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { question } = req.body;
    const userId = req.userId; // authenticateToken middleware'i req.userId set ediyor

    console.log('📝 Soru sorma isteği:', { eventId, userId, hasQuestion: !!question });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı kimliği bulunamadı!'
      });
    }

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Soru metni gerekli!'
      });
    }

    // İçeriği temizle
    const sanitizedQuestion = sanitizeContent(question);

    // İçerik moderasyonu kontrolü
    const moderationResult = moderateContent(sanitizedQuestion);
    
    console.log('🔍 İçerik moderasyonu sonucu:', {
      isSafe: moderationResult.isSafe,
      riskLevel: moderationResult.riskLevel,
      reasons: moderationResult.reasons
    });

    // Yüksek riskli içerikleri direkt reddet
    if (moderationResult.riskLevel === 'high') {
      return res.status(400).json({
        success: false,
        message: 'Soru içeriği uygun değil. Lütfen daha uygun bir dil kullanın.',
        moderationReasons: moderationResult.reasons
      });
    }

    // Etkinliği kontrol et
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Etkinlik bulunamadı!'
      });
    }

    // Kullanıcı bilgilerini al
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Soruyu oluştur - Direkt kaydedilir, sadece organizatör görecek
    const newQuestion = new EventQuestion({
      eventId,
      askedBy: userId,
      askedByName: user.name || user.phone || 'Anonim',
      askedByProfilePhoto: user.profilePhoto || null,
      question: sanitizedQuestion,
      status: 'pending',
      // Moderasyon durumu: Direkt onaylı (sadece organizatör görecek)
      moderationStatus: 'approved',
      moderationReason: moderationResult.reasons.join(', ')
    });

    await newQuestion.save();
    
    // Populate işlemi - hata olursa devam et
    try {
      await newQuestion.populate('askedBy', 'name profilePhoto');
    } catch (populateError) {
      console.warn('⚠️ Populate hatası (kritik değil):', populateError.message);
      // Populate hatası kritik değil, zaten askedByName ve askedByProfilePhoto set edildi
    }

    // Organizatöre bildirim gönder (OneSignal)
    try {
      const organizerId = event.organizerId._id || event.organizerId;
      const organizer = await User.findById(organizerId);
      if (organizer && organizer.oneSignalExternalId) {
        await OneSignalService.sendToUser(
          organizer.oneSignalExternalId,
          '❓ Yeni Soru',
          `${user.name || 'Bir kullanıcı'} "${event.title}" etkinliğiniz için soru sordu.`,
          {
            type: 'event_question',
            eventId: eventId,
            questionId: newQuestion._id,
            eventTitle: event.title
          }
        );
        console.log('✅ Organizatöre soru bildirimi gönderildi');
      }
    } catch (notifError) {
      console.error('⚠️ Organizatör bildirimi hatası (kritik değil):', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Soru başarıyla gönderildi!',
      data: newQuestion
    });
  } catch (error) {
    console.error('❌ Soru ekleme hatası:', error);
    console.error('❌ Hata detayı:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: 'Soru eklenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * GET /api/event/:eventId/questions
 * Etkinlik için soruları listele - SADECE ORGANİZATÖR GÖREBİLİR
 */
router.get('/:eventId/questions', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.userId;

    // Etkinliği kontrol et
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Etkinlik bulunamadı!'
      });
    }

    // Organizatör kontrolü - Sadece organizatör soruları görebilir
    const organizerId = event.organizerId._id || event.organizerId;
    if (organizerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için organizatör yetkisi gereklidir!'
      });
    }

    // Soruları getir - sadece organizatör görebilir
    const questions = await EventQuestion.find({ 
      eventId,
      moderationStatus: 'approved' // Onaylanmış sorular
    })
      .populate('askedBy', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: questions,
      count: questions.length
    });
  } catch (error) {
    console.error('Soruları listeleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sorular listelenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * POST /api/event/:eventId/questions/:questionId/answer
 * Soruya cevap ver (sadece organizatör)
 */
router.post('/:eventId/questions/:questionId/answer', authenticateToken, async (req, res) => {
  try {
    const { eventId, questionId } = req.params;
    const { answer } = req.body;
    const userId = req.userId; // authenticateToken middleware'i req.userId set ediyor

    if (!answer || !answer.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Cevap metni gerekli!'
      });
    }

    // Etkinliği kontrol et
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Etkinlik bulunamadı!'
      });
    }

    // Organizatör kontrolü
    const organizerId = event.organizerId._id || event.organizerId;
    if (organizerId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bu işlem için organizatör yetkisi gereklidir!'
      });
    }

    // Soruyu bul
    const question = await EventQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Soru bulunamadı!'
      });
    }

    if (question.eventId.toString() !== eventId) {
      return res.status(400).json({
        success: false,
        message: 'Soru bu etkinliğe ait değil!'
      });
    }

    // Cevabı güncelle
    question.answer = answer.trim();
    question.answeredAt = new Date();
    question.status = 'answered';
    await question.save();

    await question.populate('askedBy', 'name profilePhoto');

    // Soruyu soran kullanıcıya bildirim gönder (OneSignal)
    try {
      const askedByUserId = question.askedBy?._id || question.askedBy;
      if (askedByUserId) {
        const askedByUser = await User.findById(askedByUserId);
        if (askedByUser && askedByUser.oneSignalExternalId) {
          await OneSignalService.sendToUser(
            askedByUser.oneSignalExternalId,
            '💬 Sorunuza Cevap Geldi!',
            `${event.title} etkinliği için sorduğunuz soruya organizatör cevap verdi.`,
            {
              type: 'event_question_answer',
              eventId: eventId,
              questionId: questionId,
              eventTitle: event.title
            }
          );
          console.log('✅ Soru-cevap bildirimi gönderildi:', askedByUser.oneSignalExternalId);
        }
      }
    } catch (notifError) {
      // Bildirim hatası kritik değil, işleme devam et
      console.error('⚠️ Bildirim gönderme hatası (kritik değil):', notifError.message);
    }

    res.json({
      success: true,
      message: 'Cevap başarıyla eklendi!',
      data: question
    });
  } catch (error) {
    console.error('Cevap ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Cevap eklenirken hata oluştu!',
      error: error.message
    });
  }
});

module.exports = router;

