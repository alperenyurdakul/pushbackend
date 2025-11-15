# Firebase ve APNs Kurulum Rehberi

## 🎯 Amaç
FCM (Android) ve APNs (iOS) push notification sistemini kurmak ve batch notification sistemini aktif etmek.

---

## 📱 1. FIREBASE CLOUD MESSAGING (FCM) - Android

### Adım 1: Firebase Console'a Git
1. https://console.firebase.google.com adresine git
2. Projeni seç VEYA yeni proje oluştur
3. Proje ayarlarına git (⚙️ Project Settings)

### Adım 2: Service Account Key Oluştur
1. Sol menüden **Service Accounts** sekmesine git
2. **Generate New Private Key** butonuna tıkla
3. JSON dosyasını indir (örnek: `faydana-firebase-adminsdk-xxxxx.json`)

### Adım 3: Backend'e Ekle
**Seçenek 1: JSON içeriğini .env'e ekle (Önerilen)**
```bash
# JSON dosyasının TÜM içeriğini tek satır olarak .env'e ekle
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"faydana-app",...}
```

**Seçenek 2: Base64 encode et (Alternatif)**
```bash
# JSON dosyasını base64'e çevir
cat faydana-firebase-adminsdk.json | base64

# .env'e ekle
FIREBASE_SERVICE_ACCOUNT_KEY_BASE64=ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIKfQ==
```

### Adım 4: Android App'i Firebase'e Bağla
1. Firebase Console > Project Settings > General
2. **Add app** > **Android** seç
3. Package name: `com.faydana.alperen`
4. `google-services.json` dosyasını indir
5. `mobile/android/app/google-services.json` dizinine kopyala

### Adım 5: Test Et
```bash
# Backend'i yeniden başlat
pkill -f "node.*server.js"
cd ~/newbackend/pushbackend
nohup node server.js > backend.log 2>&1 &

# Log'ları kontrol et
tail -f backend.log
```

✅ Beklenen log: `✅ Firebase Admin SDK başlatıldı (FCM)`

---

## 🍎 2. APPLE PUSH NOTIFICATION SERVICE (APNs) - iOS

### Adım 1: Apple Developer Portal'a Git
1. https://developer.apple.com/account adresine git
2. **Certificates, Identifiers & Profiles** sekmesine git

### Adım 2: APNs Key Oluştur
1. Sol menüden **Keys** sekmesine git
2. **+** butonuna tıkla (yeni key oluştur)
3. Key Name: `Faydana APNs Key`
4. **Apple Push Notifications service (APNs)** seçeneğini işaretle
5. **Continue** > **Register**

### Adım 3: Key Bilgilerini Al
1. Oluşturulan key'e tıkla
2. **Key ID** değerini kopyala (örnek: `ABC123XYZ4`)
3. **Team ID** değerini kopyala (sağ üstte, örnek: `DEF567GHI8`)
4. **Download** butonuna tıkla (`.p8` dosyası indirilecek)

### Adım 4: .p8 Dosyasını Backend'e Ekle
**Seçenek 1: İçeriği .env'e ekle (Önerilen)**
```bash
# .p8 dosyasının içeriğini kopyala (-----BEGIN PRIVATE KEY----- ile başlayan)
# Tüm satırları \n ile birleştir
APNS_KEY=-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----
```

**Seçenek 2: Base64 encode et (Alternatif)**
```bash
# .p8 dosyasını base64'e çevir
cat AuthKey_ABC123XYZ4.p8 | base64

# .env'e ekle
APNS_KEY_BASE64=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JR1RBZ0VBQU1CTUJHTXlS...
```

### Adım 5: .env Dosyasını Güncelle
```bash
APNS_KEY_ID=ABC123XYZ4
APNS_TEAM_ID=DEF567GHI8
APNS_KEY=-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----
APNS_BUNDLE_ID=com.faydana.alperen
APNS_PRODUCTION=true  # Production için true, Development için false
```

### Adım 6: iOS App'i Apple Developer'a Bağla
1. Xcode'da projeyi aç
2. **Signing & Capabilities** sekmesine git
3. **Push Notifications** capability'sini ekle
4. **Background Modes** > **Remote notifications** seç

### Adım 7: Test Et
```bash
# Backend'i yeniden başlat
pkill -f "node.*server.js"
cd ~/newbackend/pushbackend
nohup node server.js > backend.log 2>&1 &

# Log'ları kontrol et
tail -f backend.log
```

✅ Beklenen log: `✅ APNs Provider başlatıldı (Key-based)`

---

## 🧪 3. TEST ETME

### Test Adımları:
1. ✅ Backend'i yeniden başlat
2. ✅ Mobil app'te kullanıcı login olsun (pushToken kaydedilsin)
3. ✅ Yeni bir banner oluştur + onayla
4. ✅ Dashboard'dan "🧪 Batch Test Et" butonuna tıkla
5. ✅ Backend loglarını izle

### Beklenen Loglar:
```
✅ Firebase Admin SDK başlatıldı (FCM)
✅ APNs Provider başlatıldı (Key-based)
📦 BATCH İŞLEMİ BAŞLADI: 1 bildirim
📊 Filtreleme sonucu: 1 kullanıcı bulundu
📤 1 kullanıcıya bildirim gönderiliyor...
✅ 1 başarılı, 0 başarısız
```

### Mobil App'te Beklenen:
- ✅ Bildirim gelmeli
- ✅ Bildirime tıklayınca ilgili ekrana yönlenmeli

---

## 🔍 4. SORUN GİDERME

### Firebase Sorunları:
- ❌ "Firebase service account key bulunamadı"
  - Çözüm: `.env` dosyasında `FIREBASE_SERVICE_ACCOUNT_KEY` kontrol et
  - JSON içeriği tek satır olmalı

- ❌ "FCM gönderme hatası: invalid-registration-token"
  - Çözüm: Token geçersiz, kullanıcıyı yeniden login yaptır

### APNs Sorunları:
- ❌ "APNs credentials bulunamadı"
  - Çözüm: `.env` dosyasında `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` kontrol et
  - `.p8` dosyası içeriği `\n` ile ayrılmalı

- ❌ "APN paketi kurulu değil"
  - Çözüm: Normal, `apn` paketi opsiyonel (sadece iOS bildirimleri için gerekli)

---

## ✅ 5. BAŞARILI KURULUM KONTROLÜ

Backend başladığında şu logları görmelisin:

```
✅ Firebase Admin SDK başlatıldı (FCM)        # Android için
✅ APNs Provider başlatıldı (Key-based)       # iOS için (opsiyonel)
✅ Batch notification job başlatıldı (15 dakika)
🚀 HTTP Server 5000 portunda çalışıyor
```

---

## 📝 NOTLAR

- **Firebase**: Android için zorunlu
- **APNs**: iOS için zorunlu (ama `apn` paketi opsiyonel)
- **Test**: Her iki platform için de test et
- **Production**: `APNS_PRODUCTION=true` yap

---

## 🎉 SONUÇ

Kurulum tamamlandığında:
- ✅ Android kullanıcılarına FCM ile bildirim gidecek
- ✅ iOS kullanıcılarına APNs ile bildirim gidecek
- ✅ Batch sistemi 15 dakikada bir otomatik çalışacak
- ✅ Segmentasyon filtreleme (şehir + kategori) aktif

Hazır! 🚀

