# OneSignal Bildirim Sorunu - 403 Access Denied

## Sorun
Katılımcı onaylama sırasında OneSignal bildirimi gönderilemiyor.
Hata: "Access denied. Please include an 'Authorization' header with a valid API key"

## Neden?
REST API Key yanlış veya farklı bir App ID için oluşturulmuş olabilir.

## Çözüm Adımları

### 1. OneSignal Dashboard'a Giriş Yapın
https://onesignal.com/ → Giriş Yapın

### 2. Doğru App'i Seçin
- Sol üstten "FAYDANA" (veya uygulamanızın adı) seçili olduğundan emin olun
- App ID'nin `e4150da6-cd3a-44f2-a193-254898ba5129` olduğunu doğrulayın

### 3. REST API Key'i Alın
Settings > Keys & IDs sayfasında:

**OneSignal App ID:**
```
e4150da6-cd3a-44f2-a193-254898ba5129
```

**REST API Key:** (Bu sayfadan kopyalayın)
```
Buraya OneSignal Dashboard'dan REST API Key'i yapıştırın
```

### 4. Backend'de Güncelleyin
`/backend/routes/events.js` dosyasında (satır 14):

```javascript
const ONESIGNAL_REST_API_KEY = 'BURAYA_YENİ_KEY_YAPIŞTIRIN';
```

### 5. Backend'i Yeniden Başlatın
```bash
pm2 restart all
```

### 6. Test Edin
Bir katılımcıyı onayladığınızda şu loglara bakın:
```
🔧 OneSignal Client başlatılıyor...
🔧 App ID: e4150da6-cd3a-44f2-a193-254898ba5129
🔧 REST API Key (ilk 20 karakter): os_v2_app_...
```

## Alternatif: Yeni REST API Key Oluştur

Eğer mevcut key çalışmıyorsa:

1. OneSignal Dashboard → Settings → Keys & IDs
2. "REST API Key" altında "Generate New Key" tıklayın
3. Yeni key'i kopyalayın
4. Backend'de güncelleyin
5. Backend'i restart edin

## Test Komutu

REST API Key'in çalışıp çalışmadığını test etmek için:

```bash
curl -X GET \
  "https://onesignal.com/api/v1/apps/e4150da6-cd3a-44f2-a193-254898ba5129" \
  -H "Authorization: Basic BURAYA_REST_API_KEY"
```

Başarılı ise app bilgilerini döndürecektir.

