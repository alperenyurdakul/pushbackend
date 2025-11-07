const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const OneSignal = require('onesignal-node');

// OneSignal client - Mobil uygulama ile aynı App ID kullanılmalı
// IMPORTANT: Bu değerleri OneSignal Dashboard'dan alın
// App ID: Settings > Keys & IDs > OneSignal App ID
// REST API Key: Settings > Keys & IDs > REST API Key
const ONESIGNAL_APP_ID = 'e4150da6-cd3a-44f2-a193-254898ba5129';
const ONESIGNAL_REST_API_KEY = 'os_v2_app_4qkq3jwnhjcpfimtevejrosrfgk3cootom3eka5lq4krwp7mlpn5r7l3cnpga527qmrmqxwgcizwuvibjfyj2bwbg3ebp63njyrp6pa';

console.log('🔧 OneSignal Client başlatılıyor...');
console.log('🔧 App ID:', ONESIGNAL_APP_ID);
console.log('🔧 REST API Key (ilk 20 karakter):', ONESIGNAL_REST_API_KEY.substring(0, 20) + '...');

const client = new OneSignal.Client(ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY);

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'event-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'), false);
    }
  }
});

// Etkinlik oluştur
router.post('/create-event', upload.single('image'), async (req, res) => {
  try {
    const { title, description, eventTime, location, organizer, options } = req.body;
    
    console.log('Gelen veriler:', { title, description, eventTime, location, organizer, options });
    console.log('Dosya:', req.file);
    
    // Etkinlik süresini hesapla (varsayılan 24 saat)
    const expiresAt = new Date(eventTime);
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    // Options kontrolü ve parsing
    let parsedOptions = ['Evet', 'Hayır']; // Varsayılan seçenekler
    if (options) {
      try {
        parsedOptions = JSON.parse(options);
      } catch (error) {
        console.error('Options parsing hatası:', error);
        parsedOptions = ['Evet', 'Hayır'];
      }
    }

    const eventData = {
      title,
      description,
      eventTime: new Date(eventTime),
      location,
      organizer,
      options: parsedOptions.map(option => ({
        text: option,
        votes: 0,
        voters: []
      })),
      expiresAt
    };
    
    // Eğer görsel yüklendiyse ekle
    if (req.file) {
      eventData.image = req.file.filename;
    }
    
    const newEvent = new Event(eventData);
    await newEvent.save();
    
    // Tüm kullanıcılara bildirim gönder
    await sendEventNotificationToAllUsers(newEvent);
    
    // OneSignal bildirimi de gönder
    try {
      await sendOneSignalNotification(newEvent);
    } catch (error) {
      console.error('OneSignal bildirim hatası:', error);
      // OneSignal hatası ana işlemi etkilemesin
    }
    
    res.json({
      success: true,
      message: 'Etkinlik başarıyla oluşturuldu',
      event: newEvent
    });
    
  } catch (error) {
    console.error('Etkinlik oluşturma hatası:', error);
    res.status(500).json({ message: 'Etkinlik oluşturulurken hata oluştu' });
  }
});

// Aktif etkinlikleri getir
router.get('/active-events', async (req, res) => {
  try {
    const events = await Event.find({
      status: 'active',
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Etkinlik getirme hatası:', error);
    res.status(500).json({ message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// Etkinlik detayını getir
router.get('/event/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Etkinlik bulunamadı' });
    }
    
    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Etkinlik detay hatası:', error);
    res.status(500).json({ message: 'Etkinlik detayı getirilirken hata oluştu' });
  }
});

// Oy ver
router.post('/vote/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { optionIndex, userId, userName, phone } = req.body;
    
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Etkinlik bulunamadı' });
    }
    
    if (event.status !== 'active' || event.expiresAt < new Date()) {
      return res.status(400).json({ message: 'Bu etkinlik artık aktif değil' });
    }
    
    // Kullanıcı daha önce oy vermiş mi kontrol et
    const hasVoted = event.options.some(option => 
      option.voters.some(voter => voter.userId === userId)
    );
    
    if (hasVoted) {
      return res.status(400).json({ message: 'Bu etkinlik için zaten oy verdiniz' });
    }
    
    // Oy ver
    event.options[optionIndex].votes += 1;
    event.options[optionIndex].voters.push({
      userId,
      userName,
      phone,
      votedAt: new Date()
    });
    
    event.totalVotes += 1;
    await event.save();
    
    res.json({
      success: true,
      message: 'Oyunuz başarıyla kaydedildi',
      event
    });
    
  } catch (error) {
    console.error('Oy verme hatası:', error);
    res.status(500).json({ message: 'Oy verilirken hata oluştu' });
  }
});

// Etkinlik sonuçlarını getir (Dashboard için)
router.get('/event-results/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Etkinlik bulunamadı' });
    }
    
    res.json({
      success: true,
      event
    });
  } catch (error) {
    console.error('Etkinlik sonuçları hatası:', error);
    res.status(500).json({ message: 'Etkinlik sonuçları getirilirken hata oluştu' });
  }
});

// Tüm etkinlikleri getir (Dashboard için)
router.get('/all-events', async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Tüm etkinlikler hatası:', error);
    res.status(500).json({ message: 'Etkinlikler getirilirken hata oluştu' });
  }
});

// Etkinlik sil
router.delete('/event/:id', async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ message: 'Etkinlik bulunamadı' });
    }
    
    res.json({
      success: true,
      message: 'Etkinlik başarıyla silindi'
    });
  } catch (error) {
    console.error('Etkinlik silme hatası:', error);
    res.status(500).json({ message: 'Etkinlik silinirken hata oluştu' });
  }
});

// Tüm kullanıcılara etkinlik bildirimi gönder
async function sendEventNotificationToAllUsers(event) {
  try {
    const users = await User.find({ expoPushToken: { $exists: true, $ne: null } });
    
    for (const user of users) {
      if (user.expoPushToken) {
        try {
          const message = {
            to: user.expoPushToken,
            sound: 'default',
            title: `🎉 Yeni Etkinlik: ${event.title}`,
            body: `${event.description}\n📍 ${event.location}\n⏰ ${new Date(event.eventTime).toLocaleString('tr-TR')}`,
            data: {
              type: 'event',
              eventId: event._id.toString(),
              eventTitle: event.title,
              eventTime: event.eventTime,
              location: event.location
            }
          };
          
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          });
          
          if (response.ok) {
            console.log(`Etkinlik bildirimi gönderildi: ${user.name} (${user.phone})`);
          }
        } catch (error) {
          console.error(`Bildirim gönderme hatası (${user.phone}):`, error);
        }
      }
    }
    
    console.log(`Etkinlik bildirimi ${users.length} kullanıcıya gönderildi`);
  } catch (error) {
    console.error('Toplu bildirim gönderme hatası:', error);
  }
}

// OneSignal ile bildirim gönderme fonksiyonu
async function sendOneSignalNotification(event) {
  try {
    const notification = {
      app_id: 'e4150da6-cd3a-44f2-a193-254898ba5129',
      headings: { en: '🎉 Yeni Etkinlik!' },
      contents: { en: `${event.title} - ${event.description}` },
      data: {
        eventId: event._id.toString(),
        type: 'event',
        title: event.title,
        description: event.description,
        location: event.location,
        organizer: event.organizer,
        eventTime: event.eventTime
      },
      included_segments: ['All'],
      large_icon: event.image ? `http://localhost:5000/uploads/${event.image}` : undefined,
      url: 'mobile://event/' + event._id
    };

    const response = await client.createNotification(notification);
    console.log('OneSignal bildirimi gönderildi:', response);
    return response;
  } catch (error) {
    console.error('OneSignal bildirim hatası:', error);
    throw error;
  }
}

// Katılımcı onay/red endpoint
router.put('/:eventId/participant/:participantId/approve', async (req, res) => {
  try {
    const { eventId, participantId } = req.params;
    const { approved } = req.body; // true = onay, false = red
    
    console.log('Katılımcı onay isteği:', { eventId, participantId, approved });
    
    // Event'i bul
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Etkinlik bulunamadı'
      });
    }
    
    // Katılımcıyı bul (hem _id hem userId ile kontrol et)
    const participant = event.participants.find(p => 
      p._id.toString() === participantId || p.userId.toString() === participantId
    );
    if (!participant) {
      console.log('⚠️ Katılımcı bulunamadı. Aranan ID:', participantId);
      console.log('📋 Mevcut katılımcılar:', event.participants.map(p => ({ _id: p._id, userId: p.userId })));
      return res.status(404).json({
        success: false,
        message: 'Katılımcı bulunamadı'
      });
    }
    
    // Durumu güncelle
    const oldStatus = participant.status;
    participant.status = approved ? 'approved' : 'rejected';
    await event.save();
    
    console.log('Katılımcı durumu güncellendi:', { 
      participantId, 
      oldStatus, 
      newStatus: participant.status 
    });
    
    // Kullanıcıyı bul ve OneSignal bildirimi gönder
    try {
      // participant.userId kullanarak kullanıcıyı bul
      const userId = participant.userId;
      console.log('🔍 Bildirim için kullanıcı aranıyor:', userId);
      console.log('📋 Participant tam bilgisi:', JSON.stringify(participant, null, 2));
      
      const user = await User.findById(userId);
      console.log('👤 Kullanıcı bulundu mu?:', !!user);
      if (user) {
        console.log('👤 Kullanıcı detayları:', {
          name: user.name,
          phone: user.phone,
          oneSignalPlayerId: user.oneSignalPlayerId,
          hasPlayerId: !!user.oneSignalPlayerId
        });
      }
      
      if (user && user.oneSignalPlayerId) {
        console.log('✅ Kullanıcı ve Player ID mevcut, bildirim hazırlanıyor...');
        
        const notification = {
          app_id: ONESIGNAL_APP_ID,
          headings: { 
            en: approved ? '✅ Etkinliğe Katılım Onaylandı!' : '❌ Etkinliğe Katılım Reddedildi' 
          },
          contents: { 
            en: approved 
              ? `"${event.title || event.eventTitle}" etkinliğine katılımınız onaylandı! Etkinlik günü QR kodunuzu göstermeyi unutmayın.`
              : `"${event.title || event.eventTitle}" etkinliğine katılım başvurunuz maalesef reddedildi.`
          },
          data: {
            type: 'event_participation',
            eventId: event._id.toString(),
            eventTitle: event.title || event.eventTitle,
            approved: approved,
            participantId: userId.toString()
          },
          include_player_ids: [user.oneSignalPlayerId],
          ios_badgeType: 'Increase',
          ios_badgeCount: 1
        };

        console.log('📲 OneSignal bildirimi gönderiliyor...');
        console.log('📲 Bildirim detayları:', {
          userName: user.name,
          userId: user._id,
          playerId: user.oneSignalPlayerId,
          approved,
          appId: notification.app_id,
          heading: notification.headings.en
        });

        const response = await client.createNotification(notification);
        console.log('✅ OneSignal bildirimi başarıyla gönderildi!');
        console.log('✅ OneSignal yanıtı:', JSON.stringify(response, null, 2));
      } else {
        console.log('⚠️ Kullanıcı bulunamadı veya OneSignal Player ID yok!');
        console.log('⚠️ Detaylar:', { 
          userId: userId, 
          hasUser: !!user, 
          hasPlayerId: user?.oneSignalPlayerId,
          userName: user?.name,
          userPhone: user?.phone
        });
      }
    } catch (notifError) {
      console.error('❌ Bildirim gönderme hatası:', notifError);
      console.error('❌ Hata detayları:', {
        message: notifError.message,
        statusCode: notifError.statusCode,
        body: notifError.body
      });
      // Bildirim hatası ana işlemi etkilemesin
    }
    
    res.json({
      success: true,
      message: approved ? 'Katılımcı onaylandı' : 'Katılımcı reddedildi',
      event: event
    });
    
  } catch (error) {
    console.error('Katılımcı onay hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Katılımcı onay işlemi başarısız',
      error: error.message
    });
  }
});

// OneSignal test endpoint
router.post('/test-onesignal', async (req, res) => {
  try {
    const testNotification = {
      app_id: 'e4150da6-cd3a-44f2-a193-254898ba5129',
      headings: { en: '🧪 OneSignal Test' },
      contents: { en: 'OneSignal entegrasyonu başarıyla çalışıyor!' },
      data: {
        type: 'test',
        message: 'Test bildirimi'
      },
      included_segments: ['All']
    };

    const response = await client.createNotification(testNotification);
    console.log('OneSignal test bildirimi gönderildi:', response);
    
    res.json({
      success: true,
      message: 'OneSignal test bildirimi gönderildi',
      response: response
    });
  } catch (error) {
    console.error('OneSignal test hatası:', error);
    res.status(500).json({
      success: false,
      message: 'OneSignal test hatası',
      error: error.message
    });
  }
});

module.exports = router;
