/**
 * Konum tabanlı servisler
 * Mesafe hesaplama ve geofencing için
 */

/**
 * İki koordinat arasındaki mesafeyi hesapla (Haversine formülü)
 * @param {number} lat1 - İlk nokta latitude
 * @param {number} lon1 - İlk nokta longitude
 * @param {number} lat2 - İkinci nokta latitude
 * @param {number} lon2 - İkinci nokta longitude
 * @returns {number} - Metre cinsinden mesafe
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Dünya yarıçapı (metre)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Metre cinsinden
}

/**
 * Kullanıcı konumuna yakın kampanyaları filtrele
 * @param {Object} userLocation - { latitude, longitude }
 * @param {Array} banners - Kampanya listesi
 * @param {number} radiusMeters - Yarıçap (metre, varsayılan 200)
 * @returns {Array} - Yakındaki kampanyalar (mesafe bilgisiyle)
 */
function findNearbyBanners(userLocation, banners, radiusMeters = 200) {
  if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
    return [];
  }

  const nearbyBanners = [];

  for (const banner of banners) {
    // Kampanya konumunu al
    let bannerLat = null;
    let bannerLng = null;

    // Önce restaurant.address.coordinates'ı kontrol et
    if (banner.restaurant?.address?.coordinates) {
      bannerLat = banner.restaurant.address.coordinates.lat;
      bannerLng = banner.restaurant.address.coordinates.lng;
    }
    // Eğer yoksa targetAudience.location.coordinates'ı kontrol et
    else if (banner.targetAudience?.location?.coordinates) {
      bannerLat = banner.targetAudience.location.coordinates.lat;
      bannerLng = banner.targetAudience.location.coordinates.lng;
    }

    // Koordinat varsa mesafe hesapla
    if (bannerLat && bannerLng) {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        bannerLat,
        bannerLng
      );

      // Yarıçap içindeyse listeye ekle
      if (distance <= radiusMeters) {
        nearbyBanners.push({
          ...banner.toObject ? banner.toObject() : banner,
          distance: Math.round(distance), // Tam sayıya yuvarla
          distanceText: distance < 1000 
            ? `${Math.round(distance)}m` 
            : `${(distance / 1000).toFixed(1)}km`
        });
      }
    }
  }

  // Mesafeye göre sırala (en yakın önce)
  nearbyBanners.sort((a, b) => a.distance - b.distance);

  return nearbyBanners;
}

/**
 * Kullanıcının bir kampanyaya yaklaşıp yaklaşmadığını kontrol et
 * @param {Object} userLocation - { latitude, longitude }
 * @param {Object} banner - Kampanya
 * @param {number} radiusMeters - Yarıçap (metre)
 * @returns {boolean} - Yakında mı?
 */
function isNearBanner(userLocation, banner, radiusMeters = 200) {
  if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
    return false;
  }

  let bannerLat = null;
  let bannerLng = null;

  if (banner.restaurant?.address?.coordinates) {
    bannerLat = banner.restaurant.address.coordinates.lat;
    bannerLng = banner.restaurant.address.coordinates.lng;
  } else if (banner.targetAudience?.location?.coordinates) {
    bannerLat = banner.targetAudience.location.coordinates.lat;
    bannerLng = banner.targetAudience.location.coordinates.lng;
  }

  if (!bannerLat || !bannerLng) {
    return false;
  }

  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    bannerLat,
    bannerLng
  );

  return distance <= radiusMeters;
}

module.exports = {
  calculateDistance,
  findNearbyBanners,
  isNearBanner
};

