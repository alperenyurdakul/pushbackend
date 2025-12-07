const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Banner = require('../models/Banner');
const Event = require('../models/Event');

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;

// Authentication middleware
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

// XP kazanma puanları
const XP_REWARDS = {
  campaign_use: 10,        // Kampanya kullanımı
  event_attend: 50,        // Etkinlik katılımı
  new_brand_discover: 25, // Yeni marka keşfi
  daily_checkin: 5,       // Günlük check-in
  task_complete: 20,      // Görev tamamlama
  collection_complete: 100, // Koleksiyon tamamlama
  badge_earn: 30,         // Rozet kazanma
  friend_invite: 50,      // Arkadaş davet etme
  review_post: 15,        // Yorum yapma
  share_campaign: 5       // Kampanya paylaşma
};

// Günlük görev tanımları
const DAILY_TASKS = {
  'daily_checkin': {
    id: 'daily_checkin',
    name: 'Günlük Check-in',
    description: 'Uygulamaya giriş yap',
    icon: 'calendar',
    xpReward: 5,
    type: 'checkin'
  },
  'discover_2_brands': {
    id: 'discover_2_brands',
    name: '2 Yeni Marka Keşfet',
    description: 'Bugün 2 yeni marka keşfet',
    icon: 'storefront',
    xpReward: 50,
    type: 'discover',
    target: 2
  },
  'attend_event': {
    id: 'attend_event',
    name: 'Bir Etkinliğe Katıl',
    description: 'Bir etkinliğe katıl',
    icon: 'calendar',
    xpReward: 100,
    type: 'event'
  },
  'use_campaign': {
    id: 'use_campaign',
    name: 'Kampanya Kullan',
    description: 'Bir kampanyadan yararlan',
    icon: 'ticket',
    xpReward: 20,
    type: 'campaign'
  },
  'share_campaign': {
    id: 'share_campaign',
    name: 'Kampanya Paylaş',
    description: 'Bir kampanyayı paylaş',
    icon: 'share-social',
    xpReward: 10,
    type: 'share'
  }
};

// Streak bonusları (7 gün üst üste = özel rozet + 2x puan)
const STREAK_BONUSES = {
  3: { xpMultiplier: 1.2, badge: null },
  7: { xpMultiplier: 2.0, badge: 'streak_7' },
  14: { xpMultiplier: 2.5, badge: 'streak_14' },
  30: { xpMultiplier: 3.0, badge: 'streak_30' }
};

// Sürpriz Kutusu ödül tanımları (daha dengeli ve nadir)
const SURPRISE_BOX_REWARDS = {
  normal: {
    probability: 0.85, // %85 şans
    type: 'xp',
    min: 5,
    max: 25, // Daha düşük XP aralığı
    name: 'Normal XP',
    icon: 'star',
    color: '#FFD700'
  },
  bonus_campaign: {
    probability: 0.12, // %12 şans
    type: 'bonus_campaign',
    name: 'Bonus Kampanya',
    description: 'Özel bir kampanyadan yararlan',
    icon: 'gift',
    color: '#9B59B6',
    xpBonus: 50 // Daha düşük bonus
  },
  jackpot: {
    probability: 0.03, // %3 şans (çok nadir!)
    type: 'jackpot',
    name: 'JACKPOT!',
    description: 'Büyük ödül!',
    icon: 'trophy',
    color: '#FF6B6B',
    xpBonus: 300 // Daha dengeli jackpot
  }
};

// Sürpriz kutusu açılma şansı (her kampanya kullanımında değil!)
const SURPRISE_BOX_TRIGGER_CHANCE = 0.25; // %25 şansla açılır (4 kampanyada 1 kez ortalama)

/**
 * Helper: Sürpriz kutusu açılabilir mi? (günlük limit ve şans kontrolü)
 */
async function canOpenSurpriseBox(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { canOpen: false, reason: 'Kullanıcı bulunamadı' };
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0,
          sharesToday: []
        },
        brandLoyalty: [],
        collections: []
      };
      await user.save();
    }

    // Günlük limit kontrolü (günde maksimum 1 kutu)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // dailyTasks içindeki lastSurpriseBoxDate'i kontrol et
    const lastBoxDate = user.gamification.dailyTasks?.lastSurpriseBoxDate 
      ? new Date(user.gamification.dailyTasks.lastSurpriseBoxDate)
      : null;
    
    if (lastBoxDate) {
      const lastBoxDateOnly = new Date(lastBoxDate);
      lastBoxDateOnly.setHours(0, 0, 0, 0);
      const todayOnly = new Date(today);
      todayOnly.setHours(0, 0, 0, 0);

      // Bugün zaten kutu açılmış mı?
      if (lastBoxDateOnly.getTime() === todayOnly.getTime()) {
        return { canOpen: false, reason: 'Bugün zaten sürpriz kutusu açtınız. Yarın tekrar deneyin!' };
      }
    }

    // Şans kontrolü (%25 şansla açılır)
    const random = Math.random();
    if (random > SURPRISE_BOX_TRIGGER_CHANCE) {
      return { canOpen: false, reason: 'Şans bu sefer yanınızda değildi. Bir sonraki kampanyada tekrar deneyin!' };
    }

    return { canOpen: true };
  } catch (error) {
    console.error('Sürpriz kutusu kontrol hatası:', error);
    return { canOpen: false, reason: 'Bir hata oluştu' };
  }
}

/**
 * Sürpriz kutusu ödülü hesapla
 */
function calculateSurpriseBoxReward() {
  const random = Math.random();
  let cumulativeProbability = 0;

  for (const [key, reward] of Object.entries(SURPRISE_BOX_REWARDS)) {
    cumulativeProbability += reward.probability;
    if (random <= cumulativeProbability) {
      if (reward.type === 'xp') {
        const xpAmount = Math.floor(Math.random() * (reward.max - reward.min + 1)) + reward.min;
        return {
          ...reward,
          amount: xpAmount
        };
      }
      return reward;
    }
  }

  // Fallback (normal XP)
  return {
    ...SURPRISE_BOX_REWARDS.normal,
    amount: 20
  };
}

// Koleksiyon tanımları
const COLLECTIONS = {
  // Şehir bazlı koleksiyonlar
  'samsun_best': {
    id: 'samsun_best',
    name: "Samsun'un En İyileri",
    description: 'Samsun\'da 10 farklı restoran/markayı ziyaret et',
    category: 'city',
    city: 'Samsun',
    target: 10,
    xpReward: 200,
    badgeReward: 'samsun_explorer',
    icon: 'location',
    color: '#FF6B6B'
  },
  'istanbul_best': {
    id: 'istanbul_best',
    name: "İstanbul'un En İyileri",
    description: 'İstanbul\'da 10 farklı restoran/markayı ziyaret et',
    category: 'city',
    city: 'İstanbul',
    target: 10,
    xpReward: 200,
    badgeReward: 'istanbul_explorer',
    icon: 'location',
    color: '#4ECDC4'
  },
  'ankara_best': {
    id: 'ankara_best',
    name: "Ankara'nın En İyileri",
    description: 'Ankara\'da 10 farklı restoran/markayı ziyaret et',
    category: 'city',
    city: 'Ankara',
    target: 10,
    xpReward: 200,
    badgeReward: 'ankara_explorer',
    icon: 'location',
    color: '#95E1D3'
  },
  // Kategori bazlı koleksiyonlar
  'coffee_lover': {
    id: 'coffee_lover',
    name: 'Kahve Tutkunu',
    description: '10 farklı kahve mekanını ziyaret et',
    category: 'category',
    campaignCategory: 'Kahve',
    target: 10,
    xpReward: 150,
    badgeReward: 'coffee_master',
    icon: 'cafe',
    color: '#8B4513'
  },
  'restaurant_explorer': {
    id: 'restaurant_explorer',
    name: 'Restoran Kaşifi',
    description: '10 farklı restoranı ziyaret et',
    category: 'category',
    campaignCategory: 'Restoran',
    target: 10,
    xpReward: 150,
    badgeReward: 'restaurant_master',
    icon: 'restaurant',
    color: '#FF6347'
  },
  'market_shopper': {
    id: 'market_shopper',
    name: 'Market Alışverişçisi',
    description: '10 farklı marketi ziyaret et',
    category: 'category',
    campaignCategory: 'Market',
    target: 10,
    xpReward: 150,
    badgeReward: 'market_master',
    icon: 'storefront',
    color: '#32CD32'
  },
  // Etkinlik koleksiyonları
  'event_lover': {
    id: 'event_lover',
    name: 'Etkinlik Tutkunu',
    description: '5 farklı konser/tiyatroya katıl',
    category: 'event',
    eventCategory: 'Konser',
    target: 5,
    xpReward: 250,
    badgeReward: 'event_master',
    icon: 'musical-notes',
    color: '#9B59B6'
  },
  'social_butterfly': {
    id: 'social_butterfly',
    name: 'Sosyal Kelebek',
    description: '5 farklı sosyal etkinliğe katıl',
    category: 'event',
    eventCategory: 'Sosyal Buluşma',
    target: 5,
    xpReward: 200,
    badgeReward: 'social_master',
    icon: 'people',
    color: '#FFB347'
  },
  'workshop_enthusiast': {
    id: 'workshop_enthusiast',
    name: 'Atölye Meraklısı',
    description: '5 farklı atölyeye katıl',
    category: 'event',
    eventCategory: 'Çocuk Atölyesi',
    target: 5,
    xpReward: 200,
    badgeReward: 'workshop_master',
    icon: 'construct',
    color: '#FF69B4'
  }
};

/**
 * XP kazanma endpoint'i
 * POST /api/gamification/add-xp
 */
router.post('/add-xp', authenticateToken, async (req, res) => {
  try {
    const { amount, reason, metadata } = req.body;
    const userId = req.userId;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Geçerli bir XP miktarı gerekli!'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // XP ekle
    const result = await user.addXP(amount, reason || 'XP kazanıldı');

    // Seviye atladıysa bildirim gönder
    if (result.levelUp) {
      console.log(`🎉 Kullanıcı seviye atladı: ${user.name} - ${result.oldLevel} → ${result.newLevel}`);
      // TODO: Push notification gönder
    }

    res.json({
      success: true,
      message: `${amount} XP kazanıldı!`,
      data: {
        xpGained: result.xpGained,
        totalXp: result.totalXp,
        level: result.newLevel,
        levelUp: result.levelUp,
        levelInfo: user.getLevelInfo()
      }
    });
  } catch (error) {
    console.error('XP ekleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'XP eklenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Kampanya kullanımından XP kazanma
 * POST /api/gamification/campaign-xp
 */
router.post('/campaign-xp', authenticateToken, async (req, res) => {
  try {
    const { bannerId } = req.body;
    const userId = req.userId;

    if (!bannerId) {
      return res.status(400).json({
        success: false,
        message: 'Banner ID gerekli!'
      });
    }

    const user = await User.findById(userId);
    const banner = await Banner.findById(bannerId).populate('restaurant');

    if (!user || !banner) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı veya banner bulunamadı!'
      });
    }

    // XP kazan
    const xpAmount = XP_REWARDS.campaign_use;
    const result = await user.addXP(xpAmount, `Kampanya kullanımı: ${banner.title}`);

    // Marka sadakati puanı ekle
    if (banner.restaurant && banner.restaurant._id) {
      await addBrandLoyaltyPoints(user, banner.restaurant._id, banner.restaurant.name || 'Marka', 1);
    }

    res.json({
      success: true,
      message: `${xpAmount} XP kazanıldı!`,
      data: {
        xpGained: result.xpGained,
        totalXp: result.totalXp,
        level: result.newLevel,
        levelUp: result.levelUp,
        levelInfo: user.getLevelInfo()
      }
    });
  } catch (error) {
    console.error('Kampanya XP hatası:', error);
    res.status(500).json({
      success: false,
      message: 'XP eklenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Etkinlik katılımından XP kazanma
 * POST /api/gamification/event-xp
 */
router.post('/event-xp', authenticateToken, async (req, res) => {
  try {
    const { eventId } = req.body;
    const userId = req.userId;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID gerekli!'
      });
    }

    const user = await User.findById(userId);
    const event = await Event.findById(eventId);

    if (!user || !event) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı veya etkinlik bulunamadı!'
      });
    }

    // XP kazan
    const xpAmount = XP_REWARDS.event_attend;
    const result = await user.addXP(xpAmount, `Etkinlik katılımı: ${event.title}`);

    res.json({
      success: true,
      message: `${xpAmount} XP kazanıldı!`,
      data: {
        xpGained: result.xpGained,
        totalXp: result.totalXp,
        level: result.newLevel,
        levelUp: result.levelUp,
        levelInfo: user.getLevelInfo()
      }
    });
  } catch (error) {
    console.error('Etkinlik XP hatası:', error);
    res.status(500).json({
      success: false,
      message: 'XP eklenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Kullanıcı seviye bilgisi
 * GET /api/gamification/level-info
 */
router.get('/level-info', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    const levelInfo = user.getLevelInfo();

    res.json({
      success: true,
      data: {
        ...levelInfo,
        badges: user.gamification?.badges || [],
        totalBadges: user.gamification?.badges?.length || 0
      }
    });
  } catch (error) {
    console.error('Seviye bilgisi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Seviye bilgisi alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Günlük görevleri getir
 * GET /api/gamification/daily-tasks
 */
router.get('/daily-tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0
        },
        brandLoyalty: [],
        collections: []
      };
      await user.save();
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastTaskDate = user.gamification.dailyTasks?.lastTaskDate 
      ? new Date(user.gamification.dailyTasks.lastTaskDate)
      : null;
    
    const lastTaskDateOnly = lastTaskDate ? new Date(lastTaskDate.setHours(0, 0, 0, 0)) : null;
    const todayOnly = new Date(today.setHours(0, 0, 0, 0));

    // Streak kontrolü - bugün görev yapılmış mı?
    const isTodayCompleted = lastTaskDateOnly && lastTaskDateOnly.getTime() === todayOnly.getTime();
    
    // Dün görev yapılmış mı? (streak devam ediyor mu?)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayOnly = new Date(yesterday.setHours(0, 0, 0, 0));
    const wasYesterdayCompleted = lastTaskDateOnly && lastTaskDateOnly.getTime() === yesterdayOnly.getTime();

    // Streak güncelle
    let currentStreak = user.gamification.dailyTasks?.currentStreak || 0;
    if (!isTodayCompleted) {
      if (wasYesterdayCompleted) {
        // Dün yapılmış, streak devam ediyor
        // Bugün yapılınca artacak
      } else if (lastTaskDateOnly && lastTaskDateOnly.getTime() < yesterdayOnly.getTime()) {
        // Streak kırıldı
        currentStreak = 0;
        user.gamification.dailyTasks.currentStreak = 0;
        await user.save();
      }
    }

    // Bugün tamamlanan görevler
    const completedTasksToday = user.gamification.dailyTasks?.completedTasksToday || [];
    
    // Görevleri hazırla (ilerleme bilgisi ile)
    const tasksWithProgress = await Promise.all(
      Object.values(DAILY_TASKS).map(async (task) => {
        let progress = 0;
        let progressText = '';
        
        // Check-in görevi özel
        if (task.id === 'daily_checkin') {
          progress = completedTasksToday.includes(task.id) ? 1 : 0;
          progressText = progress === 1 ? 'Tamamlandı' : 'Bekliyor';
        } else {
          // Diğer görevler için gerçek ilerleme hesapla
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          try {
            if (task.type === 'discover') {
              const CodeHistory = require('../models/CodeHistory');
              const Banner = require('../models/Banner');
              
              const todayCodeBannerIds = await CodeHistory.find({
                userId: user._id,
                createdAt: { $gte: today, $lt: tomorrow }
              }).distinct('bannerId');
              
              if (todayCodeBannerIds.length > 0) {
                const banners = await Banner.find({
                  _id: { $in: todayCodeBannerIds }
                }).select('restaurant');
                
                const uniqueRestaurantIds = [...new Set(banners.map(b => b.restaurant?.toString()).filter(Boolean))];
                progress = uniqueRestaurantIds.length;
                progressText = `${progress} / ${task.target || 2}`;
              } else {
                progressText = `0 / ${task.target || 2}`;
              }
            } else if (task.type === 'event') {
              const Event = require('../models/Event');
              const todayEvents = await Event.find({
                'participants.userId': user._id,
                'participants.status': { $in: ['approved', 'attended'] },
                'participants.appliedAt': { $gte: today, $lt: tomorrow }
              }).countDocuments();
              
              progress = todayEvents;
              progressText = progress >= 1 ? 'Tamamlandı' : 'Bekliyor';
            } else if (task.type === 'campaign') {
              const CodeHistory = require('../models/CodeHistory');
              const todayUsedCampaigns = await CodeHistory.find({
                userId: user._id,
                used: true,
                usedAt: { $gte: today, $lt: tomorrow }
              }).countDocuments();
              
              progress = todayUsedCampaigns;
              progressText = progress >= 1 ? 'Tamamlandı' : 'Bekliyor';
            } else if (task.type === 'share') {
              const sharesToday = user.gamification?.dailyTasks?.sharesToday || [];
              const todayShares = sharesToday.filter(share => {
                const shareDate = new Date(share.sharedAt);
                shareDate.setHours(0, 0, 0, 0);
                return shareDate.getTime() === today.getTime();
              });
              
              progress = todayShares.length;
              progressText = progress >= 1 ? 'Tamamlandı' : 'Bekliyor';
            } else {
              progressText = 'Bekliyor';
            }
          } catch (error) {
            console.error(`Görev ilerleme hatası (${task.id}):`, error);
            progressText = 'Hesaplanamadı';
          }
        }
        
        return {
          ...task,
          completed: completedTasksToday.includes(task.id),
          progress,
          progressText,
          canComplete: !completedTasksToday.includes(task.id)
        };
      })
    );
    
    const tasks = tasksWithProgress;

    // Streak bonusunu hesapla
    const streakBonus = STREAK_BONUSES[currentStreak] || { xpMultiplier: 1.0, badge: null };

    res.json({
      success: true,
      data: {
        tasks,
        streak: {
          current: currentStreak,
          longest: user.gamification.dailyTasks?.longestStreak || 0,
          bonus: streakBonus,
          nextMilestone: getNextStreakMilestone(currentStreak)
        },
        todayCompleted: isTodayCompleted,
        totalCompletedToday: completedTasksToday.length,
        totalTasks: tasks.length
      }
    });
  } catch (error) {
    console.error('Günlük görevler hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Günlük görevler alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Görev tamamla
 * POST /api/gamification/complete-task
 */
router.post('/complete-task', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.body;
    const userId = req.userId;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: 'Görev ID gerekli!'
      });
    }

    const task = DAILY_TASKS[taskId];
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Görev bulunamadı!'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0
        },
        brandLoyalty: [],
        collections: []
      };
    }

    if (!user.gamification.dailyTasks) {
      user.gamification.dailyTasks = {
        currentStreak: 0,
        longestStreak: 0,
        completedTasksToday: [],
        totalTasksCompleted: 0
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastTaskDate = user.gamification.dailyTasks.lastTaskDate 
      ? new Date(user.gamification.dailyTasks.lastTaskDate)
      : null;
    
    const lastTaskDateOnly = lastTaskDate ? new Date(lastTaskDate.setHours(0, 0, 0, 0)) : null;
    const todayOnly = new Date(today.setHours(0, 0, 0, 0));

    // Bugün tamamlanan görevler
    let completedTasksToday = user.gamification.dailyTasks.completedTasksToday || [];

    // Görev zaten tamamlanmış mı?
    if (completedTasksToday.includes(taskId)) {
      return res.status(400).json({
        success: false,
        message: 'Bu görev zaten tamamlanmış!'
      });
    }

    // Görev ilerlemesini kontrol et (gerçek aktivite doğrulaması)
    const canComplete = await canCompleteTask(user, task);
    if (!canComplete) {
      // Görev tipine göre özel mesaj
      let message = 'Görev henüz tamamlanamaz!';
      if (task.type === 'discover') {
        message = `Bu görev için bugün ${task.target || 2} farklı marka keşfetmeniz gerekiyor.`;
      } else if (task.type === 'event') {
        message = 'Bu görev için bugün bir etkinliğe katılmanız gerekiyor.';
      } else if (task.type === 'campaign') {
        message = 'Bu görev için bugün bir kampanya kullanmanız gerekiyor.';
      } else if (task.type === 'share') {
        message = 'Bu görev için bir kampanyayı paylaşmanız gerekiyor.';
      }
      
      return res.status(400).json({
        success: false,
        message: message
      });
    }

    // Bugün ilk görev mi? (streak için)
    const isFirstTaskToday = !lastTaskDateOnly || lastTaskDateOnly.getTime() !== todayOnly.getTime();

    // Streak güncelle
    let currentStreak = user.gamification.dailyTasks.currentStreak || 0;
    if (isFirstTaskToday) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayOnly = new Date(yesterday.setHours(0, 0, 0, 0));
      const wasYesterdayCompleted = lastTaskDateOnly && lastTaskDateOnly.getTime() === yesterdayOnly.getTime();

      if (wasYesterdayCompleted) {
        // Streak devam ediyor
        currentStreak += 1;
      } else if (lastTaskDateOnly && lastTaskDateOnly.getTime() < yesterdayOnly.getTime()) {
        // Streak kırıldı, sıfırla
        currentStreak = 1;
      } else {
        // İlk görev
        currentStreak = 1;
      }

      user.gamification.dailyTasks.currentStreak = currentStreak;
      if (currentStreak > (user.gamification.dailyTasks.longestStreak || 0)) {
        user.gamification.dailyTasks.longestStreak = currentStreak;
      }
    }

    // Görevi tamamla
    completedTasksToday.push(taskId);
    user.gamification.dailyTasks.completedTasksToday = completedTasksToday;
    user.gamification.dailyTasks.lastTaskDate = new Date();
    user.gamification.dailyTasks.totalTasksCompleted = (user.gamification.dailyTasks.totalTasksCompleted || 0) + 1;

    // Streak bonusunu hesapla
    const streakBonus = STREAK_BONUSES[currentStreak] || { xpMultiplier: 1.0, badge: null };
    const baseXP = task.xpReward;
    const finalXP = Math.round(baseXP * streakBonus.xpMultiplier);

    // XP ekle
    const xpResult = await user.addXP(finalXP, `Görev tamamlandı: ${task.name}`);

    // Streak rozeti ekle
    if (streakBonus.badge) {
      await user.addBadge(
        streakBonus.badge,
        `Streak ${currentStreak} Gün`,
        'special',
        `${currentStreak} gün üst üste görev tamamladı!`
      );
    }

    await user.save();

    res.json({
      success: true,
      message: `Görev tamamlandı! ${finalXP} XP kazandınız!`,
      data: {
        task: {
          ...task,
          completed: true
        },
        xpGained: finalXP,
        baseXP,
        streakMultiplier: streakBonus.xpMultiplier,
        streak: {
          current: currentStreak,
          longest: user.gamification.dailyTasks.longestStreak
        },
        levelInfo: user.getLevelInfo()
      }
    });
  } catch (error) {
    console.error('Görev tamamlama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Görev tamamlanırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Günlük check-in yap
 * POST /api/gamification/checkin
 */
router.post('/checkin', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Check-in görevini tamamla
    const checkinTask = DAILY_TASKS['daily_checkin'];
    
    // Görev zaten tamamlanmış mı kontrol et
    const completedTasksToday = user.gamification?.dailyTasks?.completedTasksToday || [];
    if (completedTasksToday.includes('daily_checkin')) {
      return res.json({
        success: true,
        message: 'Bugün zaten check-in yaptınız!',
        data: {
          alreadyCheckedIn: true
        }
      });
    }

    // Görev tamamlama endpoint'ini çağır (internal)
    req.body = { taskId: 'daily_checkin' };
    // Manuel olarak işle
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0
        },
        brandLoyalty: [],
        collections: []
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastTaskDate = user.gamification.dailyTasks?.lastTaskDate 
      ? new Date(user.gamification.dailyTasks.lastTaskDate)
      : null;
    
    const lastTaskDateOnly = lastTaskDate ? new Date(lastTaskDate.setHours(0, 0, 0, 0)) : null;
    const todayOnly = new Date(today.setHours(0, 0, 0, 0));
    const isFirstTaskToday = !lastTaskDateOnly || lastTaskDateOnly.getTime() !== todayOnly.getTime();

    let currentStreak = user.gamification.dailyTasks?.currentStreak || 0;
    if (isFirstTaskToday) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayOnly = new Date(yesterday.setHours(0, 0, 0, 0));
      const wasYesterdayCompleted = lastTaskDateOnly && lastTaskDateOnly.getTime() === yesterdayOnly.getTime();

      if (wasYesterdayCompleted) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }

      user.gamification.dailyTasks.currentStreak = currentStreak;
      if (currentStreak > (user.gamification.dailyTasks.longestStreak || 0)) {
        user.gamification.dailyTasks.longestStreak = currentStreak;
      }
    }

    let completedTasks = user.gamification.dailyTasks.completedTasksToday || [];
    completedTasks.push('daily_checkin');
    user.gamification.dailyTasks.completedTasksToday = completedTasks;
    user.gamification.dailyTasks.lastTaskDate = new Date();
    user.gamification.dailyTasks.totalTasksCompleted = (user.gamification.dailyTasks.totalTasksCompleted || 0) + 1;

    const streakBonus = STREAK_BONUSES[currentStreak] || { xpMultiplier: 1.0, badge: null };
    const finalXP = Math.round(checkinTask.xpReward * streakBonus.xpMultiplier);

    const xpResult = await user.addXP(finalXP, `Günlük check-in`);

    if (streakBonus.badge) {
      await user.addBadge(
        streakBonus.badge,
        `Streak ${currentStreak} Gün`,
        'special',
        `${currentStreak} gün üst üste görev tamamladı!`
      );
    }

    await user.save();

    res.json({
      success: true,
      message: `Check-in başarılı! ${finalXP} XP kazandınız!`,
      data: {
        xpGained: finalXP,
        streak: {
          current: currentStreak,
          longest: user.gamification.dailyTasks.longestStreak
        },
        levelInfo: user.getLevelInfo()
      }
    });
  } catch (error) {
    console.error('Check-in hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Check-in yapılırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Helper: Görev ilerlemesini hesapla
 */
function getTaskProgress(user, task) {
  // Bu fonksiyon görev tipine göre ilerlemeyi hesaplar
  // Şimdilik basit bir implementasyon
  return 0; // İlerleme takibi için ayrı bir sistem gerekebilir
}

/**
 * Helper: Görev tamamlanabilir mi? (Gerçek aktivite kontrolü)
 */
async function canCompleteTask(user, task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  try {
    console.log(`🔍 Görev doğrulama: ${task.id} (${task.type})`);
    
    switch (task.type) {
      case 'checkin':
        // Check-in görevi için özel endpoint kullanılmalı
        console.log('❌ Check-in görevi bu endpoint\'ten tamamlanamaz');
        return false; // Check-in için özel endpoint var, buradan tamamlanamaz
      
      case 'discover':
        // Bugün keşfedilen yeni marka sayısını kontrol et
        const CodeHistory = require('../models/CodeHistory');
        const Banner = require('../models/Banner');
        
        // Bugün oluşturulan kodlar (yeni marka keşfi)
        const todayCodeBannerIds = await CodeHistory.find({
          userId: user._id,
          createdAt: { $gte: today, $lt: tomorrow }
        }).distinct('bannerId');
        
        console.log(`📊 Bugün oluşturulan kod sayısı: ${todayCodeBannerIds.length}`);
        
        if (todayCodeBannerIds.length === 0) {
          console.log('❌ Bugün hiç kod oluşturulmamış');
          return false;
        }
        
        // Bu banner'ların restaurant ID'lerini al
        const banners = await Banner.find({
          _id: { $in: todayCodeBannerIds }
        }).select('restaurant');
        
        // Farklı restaurant sayısı (unique marka sayısı)
        const uniqueRestaurantIds = [...new Set(banners.map(b => b.restaurant?.toString()).filter(Boolean))];
        const uniqueBrandsToday = uniqueRestaurantIds.length;
        
        console.log(`📊 Farklı marka sayısı: ${uniqueBrandsToday} / ${task.target || 2}`);
        
        const canComplete = uniqueBrandsToday >= (task.target || 2);
        if (!canComplete) {
          console.log(`❌ Yeterli marka keşfedilmemiş: ${uniqueBrandsToday} < ${task.target || 2}`);
        }
        return canComplete;
      
      case 'event':
        // Bugün katıldığı etkinlik sayısını kontrol et
        const Event = require('../models/Event');
        const todayEvents = await Event.find({
          'participants.userId': user._id,
          'participants.status': { $in: ['approved', 'attended'] },
          'participants.appliedAt': { $gte: today, $lt: tomorrow }
        }).countDocuments();
        
        console.log(`📊 Bugün katıldığı etkinlik sayısı: ${todayEvents}`);
        
        const canCompleteEvent = todayEvents >= 1;
        if (!canCompleteEvent) {
          console.log('❌ Bugün hiç etkinliğe katılmamış');
        }
        return canCompleteEvent;
      
      case 'campaign':
        // Bugün kullanılan kampanya sayısını kontrol et
        const CodeHistory2 = require('../models/CodeHistory');
        const todayUsedCampaigns = await CodeHistory2.find({
          userId: user._id,
          used: true,
          usedAt: { $gte: today, $lt: tomorrow }
        }).countDocuments();
        
        console.log(`📊 Bugün kullanılan kampanya sayısı: ${todayUsedCampaigns}`);
        
        const canCompleteCampaign = todayUsedCampaigns >= 1;
        if (!canCompleteCampaign) {
          console.log('❌ Bugün hiç kampanya kullanılmamış');
        }
        return canCompleteCampaign;
      
      case 'share':
        // Bugün yapılan paylaşım sayısını kontrol et
        const sharesToday = user.gamification?.dailyTasks?.sharesToday || [];
        const todayShares = sharesToday.filter(share => {
          const shareDate = new Date(share.sharedAt);
          shareDate.setHours(0, 0, 0, 0);
          return shareDate.getTime() === today.getTime();
        });
        
        console.log(`📊 Bugün yapılan paylaşım sayısı: ${todayShares.length}`);
        
        const canCompleteShare = todayShares.length >= 1;
        if (!canCompleteShare) {
          console.log('❌ Bugün hiç kampanya paylaşılmamış');
        }
        return canCompleteShare;
      
      default:
        console.log(`❌ Bilinmeyen görev tipi: ${task.type}`);
        return false;
    }
  } catch (error) {
    console.error('❌ Görev doğrulama hatası:', error);
    console.error('Error stack:', error.stack);
    return false;
  }
}

/**
 * Helper: Sonraki streak milestone'u bul
 */
function getNextStreakMilestone(currentStreak) {
  const milestones = Object.keys(STREAK_BONUSES).map(Number).sort((a, b) => a - b);
  for (const milestone of milestones) {
    if (currentStreak < milestone) {
      return milestone;
    }
  }
  return null;
}

/**
 * Koleksiyonları getir
 * GET /api/gamification/collections
 */
router.get('/collections', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0
        },
        brandLoyalty: [],
        collections: []
      };
      await user.save();
    }

    const userCollections = user.gamification.collections || [];
    const userCity = user.city || user.preferences?.city || 'Samsun';

    // Koleksiyonları hazırla
    const collections = Object.values(COLLECTIONS).map(collection => {
      // Kullanıcının bu koleksiyonu var mı?
      const userCollection = userCollections.find(c => c.collectionId === collection.id);
      
      let progress = 0;
      let completed = false;
      let completedAt = null;

      if (userCollection) {
        progress = userCollection.progress || 0;
        completed = userCollection.completed || false;
        completedAt = userCollection.completedAt || null;
      }

      // Şehir bazlı koleksiyonları filtrele (sadece kullanıcının şehrindekileri göster)
      if (collection.category === 'city' && collection.city !== userCity) {
        return null; // Bu koleksiyonu gösterme
      }

      return {
        ...collection,
        progress,
        completed,
        completedAt,
        percentage: collection.target > 0 ? Math.min(100, Math.round((progress / collection.target) * 100)) : 0,
        remaining: Math.max(0, collection.target - progress)
      };
    }).filter(c => c !== null); // null olanları filtrele

    // Kategorilere göre grupla
    const groupedCollections = {
      city: collections.filter(c => c.category === 'city'),
      category: collections.filter(c => c.category === 'category'),
      event: collections.filter(c => c.category === 'event')
    };

    res.json({
      success: true,
      data: {
        collections,
        grouped: groupedCollections,
        stats: {
          total: collections.length,
          completed: collections.filter(c => c.completed).length,
          inProgress: collections.filter(c => !c.completed && c.progress > 0).length,
          notStarted: collections.filter(c => !c.completed && c.progress === 0).length
        }
      }
    });
  } catch (error) {
    console.error('Koleksiyonlar hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Koleksiyonlar alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Koleksiyon ilerlemesini güncelle
 * POST /api/gamification/update-collection
 */
router.post('/update-collection', authenticateToken, async (req, res) => {
  try {
    const { collectionId, increment = 1, brandId, eventId, city, category } = req.body;
    const userId = req.userId;

    if (!collectionId) {
      return res.status(400).json({
        success: false,
        message: 'Koleksiyon ID gerekli!'
      });
    }

    const collection = COLLECTIONS[collectionId];
    if (!collection) {
      return res.status(404).json({
        success: false,
        message: 'Koleksiyon bulunamadı!'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0
        },
        brandLoyalty: [],
        collections: []
      };
    }

    // Koleksiyon kontrolü
    let userCollection = user.gamification.collections.find(c => c.collectionId === collectionId);
    
    if (!userCollection) {
      // Yeni koleksiyon başlat
      userCollection = {
        collectionId: collection.id,
        collectionName: collection.name,
        category: collection.category,
        progress: 0,
        total: collection.target,
        completed: false
      };
      user.gamification.collections.push(userCollection);
    }

    // Zaten tamamlanmış mı?
    if (userCollection.completed) {
      return res.json({
        success: true,
        message: 'Bu koleksiyon zaten tamamlanmış!',
        data: {
          collection: {
            ...collection,
            progress: userCollection.progress,
            completed: true
          }
        }
      });
    }

    // İlerleme kontrolü (koleksiyon tipine göre)
    let shouldIncrement = false;

    if (collection.category === 'city') {
      // Şehir bazlı: sadece belirtilen şehirdeki markalar için
      if (city === collection.city) {
        shouldIncrement = true;
      }
    } else if (collection.category === 'category') {
      // Kategori bazlı: sadece belirtilen kategorideki markalar için
      if (category === collection.campaignCategory) {
        shouldIncrement = true;
      }
    } else if (collection.category === 'event') {
      // Etkinlik bazlı: sadece belirtilen kategorideki etkinlikler için
      if (category === collection.eventCategory) {
        shouldIncrement = true;
      }
    }

    if (!shouldIncrement) {
      return res.json({
        success: true,
        message: 'Bu işlem bu koleksiyon için geçerli değil',
        data: {
          collection: {
            ...collection,
            progress: userCollection.progress,
            completed: false
          }
        }
      });
    }

    // İlerlemeyi artır
    userCollection.progress = (userCollection.progress || 0) + increment;

    // Tamamlandı mı?
    if (userCollection.progress >= collection.target) {
      userCollection.completed = true;
      userCollection.completedAt = new Date();
      
      // Ödül ver (XP + rozet)
      await user.addXP(collection.xpReward, `Koleksiyon tamamlandı: ${collection.name}`);
      
      if (collection.badgeReward) {
        await user.addBadge(
          collection.badgeReward,
          collection.name,
          'collection',
          `${collection.name} koleksiyonunu tamamladınız!`
        );
      }

      await user.save();

      return res.json({
        success: true,
        message: `🎉 Koleksiyon tamamlandı! ${collection.xpReward} XP ve rozet kazandınız!`,
        data: {
          collection: {
            ...collection,
            progress: userCollection.progress,
            completed: true,
            completedAt: userCollection.completedAt
          },
          reward: {
            xp: collection.xpReward,
            badge: collection.badgeReward
          },
          levelInfo: user.getLevelInfo()
        }
      });
    }

    await user.save();

    res.json({
      success: true,
      message: `Koleksiyon ilerlemesi güncellendi! (${userCollection.progress}/${collection.target})`,
      data: {
        collection: {
          ...collection,
          progress: userCollection.progress,
          completed: false,
          percentage: Math.round((userCollection.progress / collection.target) * 100),
          remaining: collection.target - userCollection.progress
        }
      }
    });
  } catch (error) {
    console.error('Koleksiyon güncelleme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Koleksiyon güncellenirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Helper: Koleksiyon ilerlemesini otomatik güncelle (internal)
 */
async function updateCollectionProgress(userId, collectionId, increment = 1, metadata = {}) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log('⚠️ Koleksiyon güncelleme: Kullanıcı bulunamadı');
      return;
    }

    const collection = COLLECTIONS[collectionId];
    if (!collection) {
      console.log('⚠️ Koleksiyon güncelleme: Koleksiyon bulunamadı:', collectionId);
      return;
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0,
          sharesToday: []
        },
        brandLoyalty: [],
        collections: []
      };
    }

    let userCollection = user.gamification.collections.find(c => c.collectionId === collectionId);
    
    if (!userCollection) {
      userCollection = {
        collectionId: collection.id,
        collectionName: collection.name,
        category: collection.category,
        progress: 0,
        total: collection.target,
        completed: false
      };
      user.gamification.collections.push(userCollection);
    }

    // Zaten tamamlanmış mı?
    if (userCollection.completed) {
      return;
    }

    // İlerleme kontrolü (koleksiyon tipine göre)
    let shouldIncrement = false;

    if (collection.category === 'city') {
      if (metadata.city === collection.city) {
        shouldIncrement = true;
      }
    } else if (collection.category === 'category') {
      if (metadata.category === collection.campaignCategory) {
        shouldIncrement = true;
      }
    } else if (collection.category === 'event') {
      if (metadata.eventCategory === collection.eventCategory) {
        shouldIncrement = true;
      }
    }

    if (!shouldIncrement) {
      return;
    }

    // İlerlemeyi artır
    userCollection.progress = (userCollection.progress || 0) + increment;

    // Tamamlandı mı?
    if (userCollection.progress >= collection.target) {
      userCollection.completed = true;
      userCollection.completedAt = new Date();
      
      // Ödül ver (XP + rozet)
      await user.addXP(collection.xpReward, `Koleksiyon tamamlandı: ${collection.name}`);
      
      if (collection.badgeReward) {
        await user.addBadge(
          collection.badgeReward,
          collection.name,
          'collection',
          `${collection.name} koleksiyonunu tamamladınız!`
        );
      }

      console.log(`🎉 Koleksiyon tamamlandı: ${collection.name} (${collection.xpReward} XP + rozet)`);
    }

    await user.save();
  } catch (error) {
    console.error('❌ Koleksiyon güncelleme hatası:', error);
  }
}

/**
 * Marka sadakati puanı ekleme helper fonksiyonu
 */
async function addBrandLoyaltyPoints(user, brandId, brandName, points) {
  if (!user.gamification) {
    user.gamification = {
      xp: 0,
      level: 'Bronze',
      totalXp: 0,
      badges: [],
      dailyTasks: {
        currentStreak: 0,
        longestStreak: 0,
        completedTasksToday: [],
        totalTasksCompleted: 0
      },
      brandLoyalty: [],
      collections: []
    };
  }

  if (!user.gamification.brandLoyalty) {
    user.gamification.brandLoyalty = [];
  }

  // Marka sadakati var mı kontrol et
  let brandLoyalty = user.gamification.brandLoyalty.find(
    bl => bl.brandId && bl.brandId.toString() === brandId.toString()
  );

  if (!brandLoyalty) {
    // Yeni marka sadakati oluştur
    brandLoyalty = {
      brandId,
      brandName,
      points: 0,
      visits: 0,
      rewards: []
    };
    user.gamification.brandLoyalty.push(brandLoyalty);
  }

  // Puan ve ziyaret ekle
  brandLoyalty.points += points;
  brandLoyalty.visits += 1;
  brandLoyalty.lastVisit = new Date();

  await user.save();
  return brandLoyalty;
}

/**
 * Liderlik tablosu getir
 * GET /api/gamification/leaderboard
 */
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { period = 'weekly', city, category, limit = 100 } = req.query;
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Tarih aralığını hesapla
    const now = new Date();
    let startDate;
    
    if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'monthly') {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      // All time
      startDate = new Date(0);
    }

    // Kullanıcıları filtrele
    let query = {
      userType: 'user', // Sadece normal kullanıcılar
      'gamification.totalXp': { $exists: true }
    };

    // Şehir filtresi
    if (city) {
      query.$or = [
        { city: city },
        { 'preferences.city': city }
      ];
    }

    // Kullanıcıları getir ve sırala
    let users = await User.find(query)
      .select('name profilePhoto city preferences gamification statistics')
      .lean();

    // XP'ye göre sırala ve filtrele
    users = users
      .map(u => ({
        _id: u._id,
        name: u.name,
        profilePhoto: u.profilePhoto,
        city: u.city || u.preferences?.city,
        totalXp: u.gamification?.totalXp || 0,
        level: u.gamification?.level || 'Bronze',
        attendedEvents: u.statistics?.attendedEventsCount || 0,
        usedCampaigns: u.statistics?.usedCampaignsCount || 0,
        totalSavings: u.statistics?.totalSavings || 0
      }))
      .filter(u => u.totalXp > 0)
      .sort((a, b) => b.totalXp - a.totalXp)
      .slice(0, parseInt(limit));

    // Kullanıcının kendi sıralamasını bul
    const userRank = users.findIndex(u => u._id.toString() === userId.toString()) + 1;
    const userData = users.find(u => u._id.toString() === userId.toString());

    // Kategori bazlı sıralama (opsiyonel)
    let categoryLeaderboard = null;
    if (category) {
      // Kategori bazlı koleksiyon ilerlemesine göre sıralama
      const categoryUsers = await User.find({
        userType: 'user',
        'gamification.collections': {
          $elemMatch: {
            collectionId: category,
            progress: { $gt: 0 }
          }
        }
      })
        .select('name profilePhoto gamification')
        .lean();

      categoryLeaderboard = categoryUsers
        .map(u => {
          const collection = u.gamification?.collections?.find(c => c.collectionId === category);
          return {
            _id: u._id,
            name: u.name,
            profilePhoto: u.profilePhoto,
            progress: collection?.progress || 0,
            completed: collection?.completed || false
          };
        })
        .sort((a, b) => {
          if (a.completed && !b.completed) return -1;
          if (!a.completed && b.completed) return 1;
          return b.progress - a.progress;
        })
        .slice(0, parseInt(limit));
    }

    res.json({
      success: true,
      data: {
        leaderboard: users.map((u, index) => ({
          ...u,
          rank: index + 1
        })),
        userRank: userRank > 0 ? userRank : null,
        userData: userData || null,
        period,
        city: city || null,
        category: category || null,
        categoryLeaderboard: categoryLeaderboard
      }
    });
  } catch (error) {
    console.error('Liderlik tablosu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Liderlik tablosu alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Sürpriz kutusu aç (internal helper - diğer route'lardan çağrılabilir)
 */
async function openSurpriseBoxInternal(userId, campaignId = null, bannerId = null) {
  try {
    // Önce açılabilir mi kontrol et
    const checkResult = await canOpenSurpriseBox(userId);
    if (!checkResult.canOpen) {
      return { 
        success: false, 
        message: checkResult.reason || 'Sürpriz kutusu açılamadı',
        canOpen: false
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      return { success: false, message: 'Kullanıcı bulunamadı!' };
    }

    // Gamification yoksa başlat
    if (!user.gamification) {
      user.gamification = {
        xp: 0,
        level: 'Bronze',
        totalXp: 0,
        badges: [],
        dailyTasks: {
          currentStreak: 0,
          longestStreak: 0,
          completedTasksToday: [],
          totalTasksCompleted: 0,
          sharesToday: []
        },
        brandLoyalty: [],
        collections: []
      };
    }

    // Ödülü hesapla
    const reward = calculateSurpriseBoxReward();
    
    let rewardData = {
      type: reward.type,
      name: reward.name,
      icon: reward.icon,
      color: reward.color,
      description: reward.description || null
    };

    // Ödülü uygula
    if (reward.type === 'xp') {
      const xpAmount = reward.amount;
      await user.addXP(xpAmount, `Sürpriz Kutusu: ${reward.name}`);
      rewardData.amount = xpAmount;
      rewardData.message = `${xpAmount} XP kazandınız!`;
    } else if (reward.type === 'bonus_campaign') {
      // Bonus kampanya - özel bir kampanya kodu veya indirim kuponu
      const bonusXP = reward.xpBonus || 50;
      await user.addXP(bonusXP, `Sürpriz Kutusu: ${reward.name}`);
      rewardData.amount = bonusXP;
      rewardData.message = `${reward.name}! ${bonusXP} bonus XP kazandınız!`;
      rewardData.couponCode = `BONUS-${Date.now().toString(36).toUpperCase()}`;
    } else if (reward.type === 'jackpot') {
      // JACKPOT - büyük ödül (çok nadir!)
      const jackpotXP = reward.xpBonus || 300;
      await user.addXP(jackpotXP, `Sürpriz Kutusu: ${reward.name}`);
      
      // Özel rozet ver
      await user.addBadge(
        'jackpot_winner',
        'Jackpot Kazananı',
        'special',
        'Sürpriz kutusundan jackpot kazandınız!'
      );
      
      rewardData.amount = jackpotXP;
      rewardData.message = `🎉 JACKPOT! ${jackpotXP} XP + Özel Rozet kazandınız!`;
      rewardData.badge = 'jackpot_winner';
    }

    // Günlük limit kaydı
    if (!user.gamification.dailyTasks) {
      user.gamification.dailyTasks = {
        currentStreak: 0,
        longestStreak: 0,
        completedTasksToday: [],
        totalTasksCompleted: 0,
        sharesToday: []
      };
    }
    user.gamification.dailyTasks.lastSurpriseBoxDate = new Date();
    await user.save();

    return {
      success: true,
      message: 'Sürpriz kutusu açıldı!',
      data: {
        reward: rewardData,
        levelInfo: user.getLevelInfo()
      },
      canOpen: true
    };
  } catch (error) {
    console.error('Sürpriz kutusu hatası:', error);
    return {
      success: false,
      message: 'Sürpriz kutusu açılırken hata oluştu!',
      error: error.message
    };
  }
}

/**
 * Sürpriz kutusu aç
 * POST /api/gamification/open-surprise-box
 */
router.post('/open-surprise-box', authenticateToken, async (req, res) => {
  try {
    const { campaignId, bannerId } = req.body;
    const userId = req.userId;

    const result = await openSurpriseBoxInternal(userId, campaignId, bannerId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Sürpriz kutusu hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Sürpriz kutusu açılırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * ============================================
 * ARKADAŞ SAVAŞI SİSTEMİ
 * ============================================
 */

/**
 * Arkadaş ara (telefon veya kullanıcı adı ile)
 * GET /api/gamification/friends/search
 */
router.get('/friends/search', authenticateToken, async (req, res) => {
  try {
    const { query, type = 'phone' } = req.query; // type: 'phone' veya 'name'
    const userId = req.userId;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Arama sorgusu gerekli!'
      });
    }

    let searchQuery = {};
    if (type === 'phone') {
      // Telefon numarası ile ara (kısmi eşleşme)
      searchQuery.phone = { $regex: query.trim(), $options: 'i' };
    } else if (type === 'name') {
      // İsim ile ara
      searchQuery.name = { $regex: query.trim(), $options: 'i' };
    }

    // Kendisini ve zaten arkadaş olanları hariç tut
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    const friendIds = user.friends?.map(f => f.friendId.toString()) || [];
    friendIds.push(userId.toString());

    searchQuery._id = { $nin: friendIds.map(id => mongoose.Types.ObjectId(id)) };
    searchQuery.userType = 'user'; // Sadece normal kullanıcılar

    const results = await User.find(searchQuery)
      .select('name phone profilePhoto gamification.level gamification.totalXp')
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: {
        results: results.map(u => ({
          _id: u._id,
          name: u.name,
          phone: u.phone,
          profilePhoto: u.profilePhoto,
          level: u.gamification?.level || 'Bronze',
          totalXp: u.gamification?.totalXp || 0
        }))
      }
    });
  } catch (error) {
    console.error('Arkadaş arama hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaş aranırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaşlık isteği gönder
 * POST /api/gamification/friends/request
 */
router.post('/friends/request', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.userId;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Arkadaş ID gerekli!'
      });
    }

    if (friendId === userId) {
      return res.status(400).json({
        success: false,
        message: 'Kendinizi arkadaş olarak ekleyemezsiniz!'
      });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Zaten arkadaş mı?
    const alreadyFriend = user.friends?.some(f => f.friendId.toString() === friendId);
    if (alreadyFriend) {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı zaten arkadaşınız!'
      });
    }

    // Zaten istek gönderilmiş mi?
    const alreadySent = user.friendRequests?.sent?.some(
      r => r.toUserId.toString() === friendId
    );
    if (alreadySent) {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcıya zaten arkadaşlık isteği gönderdiniz!'
      });
    }

    // İstek gönder
    if (!user.friendRequests) {
      user.friendRequests = { sent: [], received: [] };
    }
    if (!user.friendRequests.sent) {
      user.friendRequests.sent = [];
    }

    user.friendRequests.sent.push({
      toUserId: friendId,
      sentAt: new Date()
    });

    // Karşı tarafa da ekle
    if (!friend.friendRequests) {
      friend.friendRequests = { sent: [], received: [] };
    }
    if (!friend.friendRequests.received) {
      friend.friendRequests.received = [];
    }

    friend.friendRequests.received.push({
      fromUserId: userId,
      receivedAt: new Date()
    });

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Arkadaşlık isteği gönderildi!'
    });
  } catch (error) {
    console.error('Arkadaşlık isteği gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaşlık isteği gönderilirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaşlık isteğini kabul et
 * POST /api/gamification/friends/accept
 */
router.post('/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.userId;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Arkadaş ID gerekli!'
      });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // İstek var mı kontrol et
    const requestExists = user.friendRequests?.received?.some(
      r => r.fromUserId.toString() === friendId
    );
    if (!requestExists) {
      return res.status(400).json({
        success: false,
        message: 'Bekleyen arkadaşlık isteği bulunamadı!'
      });
    }

    // Zaten arkadaş mı?
    const alreadyFriend = user.friends?.some(f => f.friendId.toString() === friendId);
    if (alreadyFriend) {
      // İsteği temizle
      user.friendRequests.received = user.friendRequests.received.filter(
        r => r.fromUserId.toString() !== friendId
      );
      friend.friendRequests.sent = friend.friendRequests.sent.filter(
        r => r.toUserId.toString() !== userId
      );
      await user.save();
      await friend.save();
      return res.status(400).json({
        success: false,
        message: 'Bu kullanıcı zaten arkadaşınız!'
      });
    }

    // Arkadaş ekle (her iki tarafa da)
    if (!user.friends) {
      user.friends = [];
    }
    if (!friend.friends) {
      friend.friends = [];
    }

    user.friends.push({
      friendId: friendId,
      addedAt: new Date()
    });
    friend.friends.push({
      friendId: userId,
      addedAt: new Date()
    });

    // İstekleri temizle
    user.friendRequests.received = user.friendRequests.received.filter(
      r => r.fromUserId.toString() !== friendId
    );
    friend.friendRequests.sent = friend.friendRequests.sent.filter(
      r => r.toUserId.toString() !== userId
    );

    // İstatistikleri güncelle
    user.friendStats = user.friendStats || { totalFriends: 0, weeklyXP: 0, monthlyXP: 0 };
    friend.friendStats = friend.friendStats || { totalFriends: 0, weeklyXP: 0, monthlyXP: 0 };
    user.friendStats.totalFriends = user.friends.length;
    friend.friendStats.totalFriends = friend.friends.length;

    // Davet bonusu ver (her ikisine de 50 XP)
    await user.addXP(50, 'Arkadaş eklendi: Davet bonusu');
    await friend.addXP(50, 'Arkadaş eklendi: Davet bonusu');

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Arkadaşlık isteği kabul edildi! Her ikiniz de 50 XP bonus kazandınız!',
      data: {
        friend: {
          _id: friend._id,
          name: friend.name,
          phone: friend.phone,
          profilePhoto: friend.profilePhoto,
          level: friend.gamification?.level || 'Bronze',
          totalXp: friend.gamification?.totalXp || 0
        }
      }
    });
  } catch (error) {
    console.error('Arkadaşlık isteği kabul hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaşlık isteği kabul edilirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaşlık isteğini reddet
 * POST /api/gamification/friends/reject
 */
router.post('/friends/reject', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.userId;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Arkadaş ID gerekli!'
      });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // İstekleri temizle
    if (user.friendRequests?.received) {
      user.friendRequests.received = user.friendRequests.received.filter(
        r => r.fromUserId.toString() !== friendId
      );
    }
    if (friend.friendRequests?.sent) {
      friend.friendRequests.sent = friend.friendRequests.sent.filter(
        r => r.toUserId.toString() !== userId
      );
    }

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Arkadaşlık isteği reddedildi!'
    });
  } catch (error) {
    console.error('Arkadaşlık isteği reddetme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaşlık isteği reddedilirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaş listesi
 * GET /api/gamification/friends/list
 */
router.get('/friends/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).populate('friends.friendId', 'name phone profilePhoto gamification.level gamification.totalXp');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    const friends = (user.friends || []).map(f => {
      const friend = f.friendId;
      if (!friend) return null;
      return {
        _id: friend._id,
        name: friend.name,
        phone: friend.phone,
        profilePhoto: friend.profilePhoto,
        level: friend.gamification?.level || 'Bronze',
        totalXp: friend.gamification?.totalXp || 0,
        addedAt: f.addedAt,
        nickname: f.nickname
      };
    }).filter(f => f !== null);

    res.json({
      success: true,
      data: {
        friends,
        totalFriends: friends.length
      }
    });
  } catch (error) {
    console.error('Arkadaş listesi hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaş listesi alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Bekleyen arkadaşlık istekleri
 * GET /api/gamification/friends/requests
 */
router.get('/friends/requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Gönderilen istekler
    const sentRequests = (user.friendRequests?.sent || []).map(async (r) => {
      const friend = await User.findById(r.toUserId)
        .select('name phone profilePhoto gamification.level gamification.totalXp')
        .lean();
      return {
        _id: friend?._id,
        name: friend?.name,
        phone: friend?.phone,
        profilePhoto: friend?.profilePhoto,
        level: friend?.gamification?.level || 'Bronze',
        totalXp: friend?.gamification?.totalXp || 0,
        sentAt: r.sentAt
      };
    });

    // Alınan istekler
    const receivedRequests = (user.friendRequests?.received || []).map(async (r) => {
      const friend = await User.findById(r.fromUserId)
        .select('name phone profilePhoto gamification.level gamification.totalXp')
        .lean();
      return {
        _id: friend?._id,
        name: friend?.name,
        phone: friend?.phone,
        profilePhoto: friend?.profilePhoto,
        level: friend?.gamification?.level || 'Bronze',
        totalXp: friend?.gamification?.totalXp || 0,
        receivedAt: r.receivedAt
      };
    });

    const sent = await Promise.all(sentRequests);
    const received = await Promise.all(receivedRequests);

    res.json({
      success: true,
      data: {
        sent: sent.filter(r => r._id),
        received: received.filter(r => r._id)
      }
    });
  } catch (error) {
    console.error('Arkadaşlık istekleri hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaşlık istekleri alınırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaşlarla puan karşılaştırma
 * GET /api/gamification/friends/compare
 */
router.get('/friends/compare', authenticateToken, async (req, res) => {
  try {
    const { period = 'weekly' } = req.query; // weekly, monthly, alltime
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Haftalık/aylık XP'yi güncelle (gerekirse)
    await updateFriendStats(user);

    // Arkadaşları getir
    const friendIds = (user.friends || []).map(f => f.friendId);
    const friends = await User.find({ _id: { $in: friendIds } })
      .select('name phone profilePhoto gamification.level gamification.totalXp friendStats')
      .lean();

    // Karşılaştırma verileri
    let userXP, friendXPList;

    if (period === 'weekly') {
      userXP = user.friendStats?.weeklyXP || 0;
      friendXPList = friends.map(f => ({
        _id: f._id,
        name: f.name,
        phone: f.phone,
        profilePhoto: f.profilePhoto,
        level: f.gamification?.level || 'Bronze',
        xp: f.friendStats?.weeklyXP || 0
      }));
    } else if (period === 'monthly') {
      userXP = user.friendStats?.monthlyXP || 0;
      friendXPList = friends.map(f => ({
        _id: f._id,
        name: f.name,
        phone: f.phone,
        profilePhoto: f.profilePhoto,
        level: f.gamification?.level || 'Bronze',
        xp: f.friendStats?.monthlyXP || 0
      }));
    } else {
      // All time
      userXP = user.gamification?.totalXp || 0;
      friendXPList = friends.map(f => ({
        _id: f._id,
        name: f.name,
        phone: f.phone,
        profilePhoto: f.profilePhoto,
        level: f.gamification?.level || 'Bronze',
        xp: f.gamification?.totalXp || 0
      }));
    }

    // Sıralama
    friendXPList.sort((a, b) => b.xp - a.xp);

    // Kullanıcının sırası
    const userRank = friendXPList.findIndex(f => f._id.toString() === userId) + 1;
    if (userRank === 0) {
      // Kullanıcı listede yoksa, kendi XP'sini ekle
      friendXPList.push({
        _id: user._id,
        name: user.name,
        phone: user.phone,
        profilePhoto: user.profilePhoto,
        level: user.gamification?.level || 'Bronze',
        xp: userXP
      });
      friendXPList.sort((a, b) => b.xp - a.xp);
    }

    const finalUserRank = friendXPList.findIndex(f => f._id.toString() === userId) + 1;

    res.json({
      success: true,
      data: {
        period,
        userXP,
        userRank: finalUserRank,
        totalFriends: friendXPList.length,
        leaderboard: friendXPList.map((f, index) => ({
          ...f,
          rank: index + 1,
          isYou: f._id.toString() === userId
        }))
      }
    });
  } catch (error) {
    console.error('Arkadaş karşılaştırma hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaş karşılaştırması yapılırken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Arkadaş sil
 * DELETE /api/gamification/friends/remove
 */
router.delete('/friends/remove', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    const userId = req.userId;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: 'Arkadaş ID gerekli!'
      });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı!'
      });
    }

    // Arkadaşlığı kaldır (her iki taraftan da)
    if (user.friends) {
      user.friends = user.friends.filter(f => f.friendId.toString() !== friendId);
    }
    if (friend.friends) {
      friend.friends = friend.friends.filter(f => f.friendId.toString() !== userId);
    }

    // İstatistikleri güncelle
    if (user.friendStats) {
      user.friendStats.totalFriends = user.friends.length;
    }
    if (friend.friendStats) {
      friend.friendStats.totalFriends = friend.friends.length;
    }

    await user.save();
    await friend.save();

    res.json({
      success: true,
      message: 'Arkadaşlık kaldırıldı!'
    });
  } catch (error) {
    console.error('Arkadaş silme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Arkadaş silinirken hata oluştu!',
      error: error.message
    });
  }
});

/**
 * Helper: Arkadaş istatistiklerini güncelle (haftalık/aylık XP)
 */
async function updateFriendStats(user) {
  try {
    const now = new Date();
    const lastWeeklyReset = user.friendStats?.lastWeeklyReset;
    const lastMonthlyReset = user.friendStats?.monthlyXP;

    // Haftalık reset kontrolü
    if (!lastWeeklyReset || (now - new Date(lastWeeklyReset)) > 7 * 24 * 60 * 60 * 1000) {
      user.friendStats = user.friendStats || { totalFriends: 0, weeklyXP: 0, monthlyXP: 0 };
      user.friendStats.weeklyXP = 0;
      user.friendStats.lastWeeklyReset = now;
    }

    // Aylık reset kontrolü
    if (!lastMonthlyReset || (now.getMonth() !== new Date(lastMonthlyReset).getMonth())) {
      user.friendStats = user.friendStats || { totalFriends: 0, weeklyXP: 0, monthlyXP: 0 };
      user.friendStats.monthlyXP = 0;
      user.friendStats.lastMonthlyReset = now;
    }

    // XP'yi güncelle (totalXp'den hesapla)
    const totalXp = user.gamification?.totalXp || 0;
    // Bu hafta kazanılan XP = totalXp - (geçen hafta totalXp)
    // Basit bir yaklaşım: totalXp'yi kullan (gerçek uygulamada daha detaylı tracking gerekir)
    user.friendStats.weeklyXP = totalXp; // Geçici: gerçek implementasyonda haftalık tracking gerekir
    user.friendStats.monthlyXP = totalXp; // Geçici: gerçek implementasyonda aylık tracking gerekir

    await user.save();
  } catch (error) {
    console.error('Arkadaş istatistikleri güncelleme hatası:', error);
  }
}

module.exports = router;
module.exports.updateCollectionProgress = updateCollectionProgress;
module.exports.openSurpriseBox = openSurpriseBoxInternal;

