const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Banner = require('../models/Banner');
const Event = require('../models/Event');
const { authenticateToken } = require('../middleware/auth');

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

