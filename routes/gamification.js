const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
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
    
    // Görevleri hazırla
    const tasks = Object.values(DAILY_TASKS).map(task => ({
      ...task,
      completed: completedTasksToday.includes(task.id),
      progress: getTaskProgress(user, task),
      canComplete: !completedTasksToday.includes(task.id)
    }));

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

    // Görev ilerlemesini kontrol et
    if (!canCompleteTask(user, task)) {
      return res.status(400).json({
        success: false,
        message: 'Görev henüz tamamlanamaz!'
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
 * Helper: Görev tamamlanabilir mi?
 */
function canCompleteTask(user, task) {
  // Görev tipine göre kontrol
  // Şimdilik tüm görevler tamamlanabilir
  return true;
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

module.exports = router;

