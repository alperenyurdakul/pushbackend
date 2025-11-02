const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Event = require('../models/Event');
const User = require('../models/User');
const EventReview = require('../models/EventReview');
const multer = require('multer');
const path = require('path');
const uploadS3 = require('../middleware/uploadS3');
const { uploadBase64ToS3 } = require('../middleware/uploadS3');
const OneSignal = require('onesignal-node');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// OneSignal client
const client = new OneSignal.Client('bd7cf25d-3767-4075-a84d-3f9332db9406', 'os_v2_app_xv6pexjxm5ahlkcnh6jtfw4uaysjwjo7rmlen35t2y2jnizajtbfvvbm27o2mdmbq2l5nsx7khz7an3xzmx35hbupuoydek2wwa7ykq');

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
      bannerImageUrl = await uploadBase64ToS3(bannerImage, 'events');
    } else if (bannerImage && (bannerImage.startsWith('http://') || bannerImage.startsWith('https://'))) {
      bannerImageUrl = bannerImage;
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
          app_id: 'bd7cf25d-3767-4075-a84d-3f9332db9406',
          headings: { en: '🎉 Yeni Etkinlik Onaylandı!' },
          contents: { en: `${event.title}` },
          data: { eventId: event._id.toString(), type: 'event' },
          included_segments: ['All'],
        };
        await client.createNotification(notification);
      } catch (error) {
        console.error('OneSignal bildirim hatası:', error);
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
    
    // QR kod oluştur
    const qrCode = event.generateQRCode(user._id);
    
    event.participants.push({
      userId: user._id,
      userName: user.name,
      userProfilePhoto: user.profilePhoto,
      phone: user.phone,
      status: 'pending',
      qrCode
    });
    
    await event.save();
    
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
    
    // OneSignal bildirimi (onaylanırsa)
    if (approved && participant.userId && participant.userId.oneSignalUserId) {
      try {
        const notification = {
          app_id: 'bd7cf25d-3767-4075-a84d-3f9332db9406',
          headings: { en: '✅ Etkinlik Başvurunuz Onaylandı!' },
          contents: { en: `${event.title} etkinliğine katılımınız onaylandı.` },
          data: { eventId: event._id.toString(), type: 'event-approval' },
          include_player_ids: [participant.userId.oneSignalUserId]
        };
        await client.createNotification(notification);
      } catch (error) {
        console.error('OneSignal bildirim hatası:', error);
      }
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
    
    const participant = event.participants.find(p => p.qrCode === qrCode);
    
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Geçersiz QR kod' });
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

module.exports = router;

