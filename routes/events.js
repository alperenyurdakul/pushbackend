const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const OneSignal = require('onesignal-node');

// OneSignal client - Gerçek credentials
const client = new OneSignal.Client('bd7cf25d-3767-4075-a84d-3f9332db9406', 'os_v2_app_xv6pexjxm5ahlkcnh6jtfw4uaysjwjo7rmlen35t2y2jnizajtbfvvbm27o2mdmbq2l5nsx7khz7an3xzmx35hbupuoydek2wwa7ykq');

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
      app_id: 'bd7cf25d-3767-4075-a84d-3f9332db9406',
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

// OneSignal test endpoint
router.post('/test-onesignal', async (req, res) => {
  try {
    const testNotification = {
      app_id: 'bd7cf25d-3767-4075-a84d-3f9332db9406',
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
