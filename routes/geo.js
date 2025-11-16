const express = require('express');
const router = express.Router();
const GeoEvent = require('../models/GeoEvent');

/**
 * OS-level geofence webhook
 * Body: { userId, type: 'enter'|'exit'|'dwell', regionId, latitude, longitude, ts }
 */
router.post('/region-event', async (req, res) => {
  try {
    const { userId, type, regionId, latitude, longitude, ts } = req.body || {};
    if (!userId || !type || !regionId) {
      return res.status(400).json({ message: 'userId, type ve regionId gereklidir' });
    }
    const eventTime = ts ? new Date(ts) : new Date();

    // Kurallar
    const COOLDOWN_HOURS = Number(process.env.GEO_COOLDOWN_HOURS || 6); // kullanıcı-region bazlı 6 saat cooldown
    const DAILY_CAP = Number(process.env.GEO_DAILY_CAP || 5); // kullanıcı başına günlük max tetik

    // 1) Günlük cap kontrolü
    const dayStart = new Date(eventTime);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(eventTime);
    dayEnd.setHours(23, 59, 59, 999);

    const todayCount = await GeoEvent.countDocuments({
      userId,
      createdAt: { $gte: dayStart, $lte: dayEnd },
      type: { $in: ['enter', 'dwell'] },
    });

    if (todayCount >= DAILY_CAP) {
      console.log('⏱️ [GEO] Günlük cap aşıldı, event kabul edildi ama aksiyon yok', { userId, todayCount });
      // Yine de event’i kayıt altına alalım (audit)
      await GeoEvent.create({ userId, type, regionId, latitude, longitude, ts: eventTime });
      return res.status(202).json({ ok: true, skipped: true, reason: 'daily_cap' });
    }

    // 2) Cooldown kontrolü (user+region)
    const cooldownSince = new Date(eventTime.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000);
    const lastRegionEvent = await GeoEvent.findOne({
      userId,
      regionId,
      type: { $in: ['enter', 'dwell'] },
      createdAt: { $gte: cooldownSince },
    }).sort({ createdAt: -1 }).lean();

    if (lastRegionEvent) {
      console.log('⏳ [GEO] Cooldown aktif, event kabul edildi ama aksiyon yok', { userId, regionId });
      await GeoEvent.create({ userId, type, regionId, latitude, longitude, ts: eventTime });
      return res.status(202).json({ ok: true, skipped: true, reason: 'cooldown' });
    }

    // 3) Event’i kaydet (audit)
    await GeoEvent.create({ userId, type, regionId, latitude, longitude, ts: eventTime });

    console.log('📡 [GEO] Region event kabul edildi', {
      userId, type, regionId, latitude, longitude, ts: eventTime.toISOString(),
    });

    // 4) İsteğe bağlı: server-side push tetikle (kural eklenebilir)
    // Örn: type enter/dwell ise yakın kampanya push’u
    // const { sendPushNotification } = require('../services/pushNotificationService');
    // await sendPushNotification({ ... });

    return res.status(202).json({ ok: true, skipped: false });
  } catch (error) {
    console.error('❌ [GEO] Region event hatası:', error?.message);
    return res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router;


