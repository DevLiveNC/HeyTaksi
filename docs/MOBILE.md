# Mobil kurulum (PWA + Capacitor)

Hey Taksi yolcu ve sürücü arayüzleri Vite + React SPA’dır. Bu faz mevcut kodu **telefona kurulabilir** hale getirir; React Native yeniden yazımı yoktur. Yönetim paneli web’de kalır.

## Kademeler

| Kademe | Durum | Ne işe yarar |
|---|---|---|
| 1. PWA manifest | Bu PR | Chrome / Safari “Ana ekrana ekle” |
| 2. Capacitor kabuğu | Bu PR | Android APK / iOS native proje |
| 3. Native konum + oturum | Bu PR | GPS eklentisi, Preferences, cihaz `ios`/`android` |
| 4. Push + arka plan GPS | Sonraki | Kilit ekranı teklifi, sürücü arka plan konumu |
| 5. Play Store / App Store | Sonraki | İmza, gizlilik formu, inceleme |

Vercel Functions kalıcı WebSocket tutmaz. Canlı yolculuk için API’nin `wss://` sunan uzun yaşayan bir ortamda olması gerekir; aksi halde native uygulama giriş yapar ama teklif akışı düşer.

## 1. Tarayıcıdan ana ekrana ekle (PWA)

Yolcu: production URL’yi telefondan aç → tarayıcı menüsü → **Ana ekrana ekle**.

Sürücü uygulaması için aynı adım geçerlidir. PWA sürücü arka plan GPS’i ve güvenilir push’u karşılamaz; sahada Capacitor APK kullanın.

## 2. Android APK (kendi telefonuna kur)

Gereksinimler: Node 22+, [Android Studio](https://developer.android.com/studio) (SDK 35 / build-tools), JDK 21.

```bash
npm install
npm run icons
npm run build:native:passenger   # apps/passenger/android
npm run build:native:driver      # apps/driver/android
```

İlk seferde native proje yoksa:

```bash
npm run cap:add:android
npm run build:native:passenger
npm run build:native:driver
```

Android Studio:

```bash
npm run cap:open:android --workspace=@heytaksi/passenger
```

Run → bağlı telefon veya emülatör. Çıktı APK: Android Studio **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

Native derleme `apps/*/ .env.native` içindeki production API adresini gömer:

- `VITE_API_URL=https://hey-taksi-api.vercel.app/api/v1`
- `VITE_WS_URL=wss://hey-taksi-api.vercel.app/ws`

Yerel API’ye bağlamak için bu dosyaları `http://<bilgisayar-ip>:3000` olacak şekilde değiştirin; telefon ve geliştirme makinesi aynı ağda olmalıdır. Capacitor WebView origin’i (`https://localhost`, `capacitor://localhost`) API CORS listesinde otomatik kabul edilir.

## 3. iOS (Mac + Apple Developer)

```bash
npm run cap:add:ios --workspace=@heytaksi/passenger
npm run cap:add:ios --workspace=@heytaksi/driver
npm run build:native:passenger
npm run cap:open:ios --workspace=@heytaksi/passenger
```

`cap sync` `NSLocationWhenInUseUsageDescription` metnini Info.plist’e yazar. TestFlight için ücretli Apple Developer Program gerekir.

## 4. Bu fazda neler native?

- **Oturum:** web’de `localStorage`; native’de Capacitor Preferences ile çift yazılır.
- **Cihaz:** girişte `platform: ios | android | web` gönderilir.
- **Konum:** native’de `@capacitor/geolocation` `navigator.geolocation` köprüsü; izin diyaloğu işletim sisteminindir.
- **Geri tuşu:** Android’de geçmişte geri, kökte uygulamadan çık.
- **Safe area:** çentik / ev göstergesi için `env(safe-area-inset-*)`.

## 5. Bilinçli olarak sonraki faza bırakılanlar

- FCM / APNs push (yolculuk teklifi kilit ekranı)
- Sürücü arka plan konum servisi (Android foreground service + iOS Always)
- Play Console / App Store Connect yayını
- Keychain / Keystore şifreli token (Preferences SharedPreferences/UserDefaults kullanır)

Paket kimlikleri: `com.heytaksi.passenger`, `com.heytaksi.driver`.
