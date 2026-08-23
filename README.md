# Hey Taksi

Hey Taksi; yolcu, sürücü ve operasyon ekiplerini aynı platformda buluşturmak üzere tasarlanmış TypeScript monoreposudur. Faz 6 ile gerçek zamanlı yolculuk ve sürücü eşleştirme sistemi tamamlanmıştır.

## Mimari

```text
apps/
  api/          Fastify REST API, WebSocket, PostgreSQL ve Redis adaptörleri
  passenger/    Responsive React yolcu uygulaması
  driver/       Responsive React sürücü uygulaması
  admin/        Responsive React yönetim paneli
packages/
  shared/       Roller, API sözleşmeleri, Zod şemaları, realtime tipleri
  ui/           Ortak React arayüz bileşenleri
```

Backend modüler monolit olarak başlar. `auth`, `users`, `drivers`, `vehicles`, `rides`, `payments`, `notifications`, `dispatch`, `support` ve `admin` sınırları bağımsız servis katmanlarına ayrılmıştır. Trafik ve ekip büyüdüğünde bu sınırlar mikro servislere taşınabilir.

## Hızlı başlangıç

Gereksinimler: Node.js 22+, npm 10+, Docker (PostgreSQL/Redis için).

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:migrate
# .env içindeki ADMIN_* değerleriyle ilk yetkili hesabı oluştur:
npm run db:seed-admin
npm run dev:api
```

Ayrı terminallerde:

```bash
npm run dev:passenger  # http://localhost:5173
npm run dev:driver     # http://localhost:5174
npm run dev:admin      # http://localhost:5175
```

Canlı dağıtımı gözlemlemek için demo filosunu çalıştırın:

```bash
npm run db:seed-fleet
npm run dev:simulate-fleet
```

API `http://localhost:3000`, Swagger UI `/docs`, liveness `/health/live`, readiness `/health/ready`, WebSocket `/ws` adresindedir.

## Kalite komutları

```bash
npm run typecheck
npm run build
npm test
```

## Environment

Tüm değişkenler `.env.example` içinde belgelenmiştir. Production ortamında özellikle `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` ve `CORS_ORIGINS` güvenli değerlerle sağlanmalıdır. `VITE_API_URL` ile `VITE_WS_URL` frontend build zamanında verilir. Secret değerleri repoya eklenmemelidir.

## Authentication API

Başlıca endpointler:

- `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`
- `POST /api/v1/auth/otp/request`, `/otp/verify`
- `GET /api/v1/auth/me`, `/sessions`; `DELETE /sessions/:sessionId`
- `GET/PATCH /api/v1/users/me`, `GET /users/me/devices`
- `GET /api/v1/drivers/me`, `POST /drivers/me/vehicles`, `POST /drivers/me/documents`
- Yetkili roller için `GET /api/v1/admin/overview`, `/users`, `/audit-logs`

Refresh tokenlar veritabanında SHA-256 özetiyle tutulur ve her yenilemede rotate edilir. Parolalar Argon2 ile hashlenir; OTP kodları HMAC özeti, süre, deneme sınırı ve istek limitiyle korunur. Production SMS teslimatı bir sağlayıcı adaptörü gerektirir; OTP kodu production yanıtlarına/loglarına yazılmaz.

## Yolcu UI/UX sistemi

Faz 3 yolcu deneyimi `apps/passenger/src/features` altında `home`, `rides`, `wallet`, `profile` ve `notifications` alanlarına ayrılır. `PassengerExperienceProvider` favori adres, temsili yakın taksi, bildirim, cüzdan ve yolculuk filtrelerinin UI state'ini yönetir. Profil ekranı mevcut `/users/me` API'sini kullanır; diğer veri kaynakları gerçek GPS/dispatch/ödeme servisleri geldiğinde feature bileşenleri değişmeden repository/API katmanına taşınabilecek tipli sözleşmelerle hazırlanmıştır.

## Konum ve yolculuk altyapısı

Faz 4 ile MapLibre GL tabanlı harita, browser geolocation izin akışı, Nominatim uyumlu geocoding ve OSRM uyumlu routing adaptörleri eklendi. Provider adresleri environment değişkenleriyle self-hosted veya ticari servislere taşınabilir. Yolculuk talebi, sunucu tarafı fiyat tahmini, temel uygun sürücü eşleştirme, durum makinesi, iptal kaydı ve WebSocket `ride.updated` kanalı hazırdır.

```text
POST /api/v1/locations/route
GET  /api/v1/locations/search
GET  /api/v1/locations/reverse
POST /api/v1/rides
GET  /api/v1/rides/current
POST /api/v1/rides/:rideId/match
POST /api/v1/rides/:rideId/cancel
PATCH /api/v1/rides/:rideId/status
POST  /api/v1/rides/:rideId/location
```

`MAP_FALLBACK=true` iken routing/geocoding sağlayıcısına ulaşılamazsa geliştirme ortamı için yaklaşık rota/adres üretilir; production'da bu mod kapatılmalıdır.

## Sürücü deneyimi (Faz 5)

Sürücü uygulaması (`apps/driver`) koyu temalı bir sürücü konsolu sunar: ana ekranda çevrim içi anahtarı, günlük kazanç, bugünkü yolculuk sayısı, ortalama puan, yoğunluk bölgeleri ve MapLibre haritası yer alır. Sürücü durum makinesi beş durumdan oluşur:

```text
offline ⇄ online → available ⇄ paused        (sürücü seçimi: offline/online/paused)
                   ↘ on_trip                 (sistem: teklif kabulü ile girilir, bitişte available'a döner)
```

Yolcu eşleştiğinde sürücüye 20 saniyelik kabul penceresiyle `ride.offer` bildirimi gider (pickup, varış, mesafe, tahmini süre, tahmini kazanç, yolcu puanı, kabul/red). Kabul edilirse akış `driver_arriving → driver_arrived → started → in_progress → completed` durum makinesiyle ilerler; bekleme süresi `driver_arrived` anından itibaren ölçülür. Sürücü; harita navigasyonu, yolcu bilgileri, maskeli telefonla güvenli arama, yolculuk içi mesajlaşma, nedenli iptal ve yolcu puanlama özelliklerine sahiptir. Kazanç ekranı günlük/haftalık/aylık özet ve yolculuk bazlı döküm gösterir; ödeme çekme sistemi bu fazda bilinçli olarak yoktur.

```text
GET   /api/v1/drivers/me/dashboard            özet + yoğunluk bölgeleri (son 3 saat)
PATCH /api/v1/drivers/me/availability         offline | online | paused
GET   /api/v1/drivers/me/rides/current        bekleyen teklif veya aktif yolculuk
GET   /api/v1/drivers/me/earnings?period=     day | week | month
POST  /api/v1/drivers/me/location             sürücü konum sinyali (10 sn'de bir)
POST  /api/v1/rides/:rideId/accept|reject     teklif yanıtı (ret kaydı eşleşmede hariç tutulur)
GET|POST /api/v1/rides/:rideId/messages       yolculuk içi mesajlaşma
POST  /api/v1/rides/:rideId/rating            tamamlanan yolculukta karşılıklı puanlama
GET   /api/v1/rides/:rideId/contact           maskeli numara + güvenli arama notları
```

WebSocket kanalına `driver.subscribe` ile abone olunur; `ride.offer`, `driver.updated`, `ride.updated` ve `ride.message` olayları akar. Kabul penceresi dolan atamalar sunucu tarafından otomatik olarak aramaya döner ve yolcu uygulamaya bildirilir. Demo verisi için:

```bash
npm run db:seed-demo       # driver@heytaksi.com / HeyTaksi2026 (+ yolcu ve geçmiş yolculuklar)
npm run db:seed-all-demo   # tüm roller için demo hesaplar: passenger, driver, admin, dispatcher, support (docs/DEMO_ACCOUNTS.md)
```

## Gerçek zamanlı dispatch (Faz 6)

Faz 6, yolculuk talebinden sürücü atamasına kadar tüm akışı gerçek zamanlı ve deterministik hale getirir. **Bu fazda yapay zekâ kullanılmaz**; sıralama tamamen açık formüllü ve tekrarlanabilirdir.

### Eşleştirme akışı

```text
Yolcu talebi (POST /rides)
  ↓ dispatch_sessions kaydı açılır (yarıçap 3 km)
Uygun sürücüleri bul        Redis GEO yakınlık sorgusu (TTL 60 sn içindeki sinyaller)
  ↓
Araç tipine göre filtrele   aktif araç + doğrulanmış sürücü + online/available + aktif yolculuğu yok
  ↓
ETA hesapla                 kuş uçuşu × 1.35 yol katsayısı, 26 km/sa şehir hızı, +45 sn hazırlık
  ↓
Sürücüleri sırala           ağırlıklı skor (aşağıda), eşitlikte ETA → mesafe → id ile kararlı sıralama
  ↓
Teklif gönder               ride.offer, 20 sn kabul penceresi (dispatch_offers)
  ↓
Sürücü kabul eder           ride assigned → driver_assigned, oturum kapanır
```

Sürücü **reddederse veya süre dolarsa** teklif kapanır ve motor aynı sıralamadaki bir sonraki sürücüye geçer. Aday kalmazsa yarıçap 3 km → 6 km → 12 km olarak genişler. Toplam arama süresi 180 saniyedir; sonunda yolcuya sonuçsuz bildirimi gider ve operasyon aramayı yeniden başlatabilir.

### Skorlama

Her bileşen 0-1 aralığına normalize edilir, ağırlıklandırılır ve 0-100 arasına ölçeklenir:

| Bileşen | Ağırlık | Hesap |
|---|---|---|
| Mesafe | 0.35 | `1 − mesafe / yarıçap` |
| ETA | 0.25 | `1 − ETA / 900 sn` |
| Sürücü puanı | 0.15 | `(puan − 3) / 2` |
| Kabul oranı | 0.15 | `kabul% / 100` |
| İptal oranı | 0.10 | `1 − iptal% / 100` |

Kabul ve iptal oranları `dispatch_offers` ile `ride_cancellations` kayıtlarından her yanıt sonrası yeniden hesaplanır; elle girilen değer kullanılmaz. Skorlama saf fonksiyondur ve `apps/api/src/modules/dispatch/dispatch-scoring.test.ts` içinde determinizm, sınır değerler ve sıralama kararlılığı test edilir.

### Sürücü konumu ve Redis

Sürücü uygulaması çevrim içiyken **5 saniyede bir** konum gönderir. Birincil kanal açık WebSocket'tir (`driver.location`); soket kapalıysa aynı sinyal `POST /drivers/me/location` ucuna düşer.

- **Redis birincil kaynaktır**: `drivers:geo` (GEO index, yakınlık sorgusu), `drivers:state` (durum/araç/yolculuk), `drivers:seen` (son görülme, bayat kayıt temizliği).
- **PostgreSQL yedektir**: `driver_locations` tablosu her sinyalde güncellenir. Redis erişilemezse dispatch kutu filtresi + haversine ile PostgreSQL üzerinden çalışmaya devam eder.
- Sinyali 60 saniyeden eski olan sürücü aktif defterden düşer ve teklif almaz.

### WebSocket olayları

| Yön | Olay | Açıklama |
|---|---|---|
| İstemci → | `auth`, `ping` | JWT doğrulama, canlılık |
| İstemci → | `ride.subscribe` / `ride.unsubscribe` | Yolculuk kanalı (yalnızca katılımcılar) |
| İstemci → | `driver.subscribe`, `passenger.subscribe` | Kullanıcı kanalı |
| İstemci → | `driver.location`, `passenger.location` | Konum sinyali |
| İstemci → | `dispatch.subscribe` | Operasyon kanalı (`dispatch:monitor` izni) |
| → İstemci | `ride.offer`, `ride.offer.closed` | Teklif geldi / kapandı (red, zaman aşımı, iptal) |
| → İstemci | `ride.updated`, `ride.location`, `passenger.location`, `ride.message` | Yolculuk durumu ve canlı konum |
| → İstemci | `driver.updated`, `driver.location.ack` | Sürücü durumu ve sinyal onayı |
| → İstemci | `dispatch.drivers`, `dispatch.driver.moved`, `dispatch.driver.left`, `dispatch.ride` | Canlı harita akışı |

Bağlantılar 30 saniyede bir ping ile denetlenir; yanıtsız soketler kapatılır. Tüm istemciler üstel gecikmeyle yeniden bağlanır ve aboneliklerini otomatik kurar.

### API

```text
GET  /api/v1/dispatch/live                        canlı sürücü + yolculuk anlık görüntüsü (dispatch:monitor)
GET  /api/v1/dispatch/nearby?latitude=&longitude=  yolcuya anonim yakın sürücüler (kimlik açılmaz)
GET  /api/v1/dispatch/rides/:rideId                arama durumu + teklif geçmişi (dispatch:monitor)
GET  /api/v1/dispatch/rides/:rideId/candidates     skor bileşenleriyle aday sıralaması (dispatch:monitor)
POST /api/v1/dispatch/rides/:rideId/restart        sonuçsuz aramayı yeniden başlat (dispatch:manage)
```

### Admin canlı haritası

`apps/admin` içindeki **Canlı operasyon** ekranı sürücüleri MapLibre üzerinde tek bir GeoJSON kaynağıyla çizer; her konum güncellemesinde yalnızca kaynak verisi değişir, bu yüzden yüzlerce sürücüde de akıcı kalır. Ekran; durum sayaçları, bekleyen talepler, aktif yolculuklar, sürücü detayları, deterministik sıralama tablosu ve teklif geçmişini gösterir. Tile sağlayıcısına ulaşılamazsa harita çevrimdışı altlığa geçer ve sürücü konumları görünmeye devam eder.

### Demo filosu

```bash
npm run db:seed-fleet        # 8 sürücü: farklı araç tipi, puan, kabul ve iptal oranı (şifre: FleetDemo2026!)
npm run dev:simulate-fleet   # sürücüleri hareket ettirir ve teklifleri yanıtlar (yalnızca geliştirme)
```

Simülatörün teklif davranışı `SIMULATOR_OFFER_POLICY` ile ayarlanır: `accept` (varsayılan, yolculuğu tamamlar), `reject` (sıradaki sürücüye geçişi gösterir) veya `ignore` (zaman aşımı akışını gösterir). `SIMULATOR_ACCEPT_DELAY` saniyesi kadar bekleyerek gerçek sürücü uygulamasına öncelik tanır.

## Faz sınırı

Dispatch deterministiktir: sabit ağırlıklı skor, sabit yarıçap adımları ve sabit zaman pencereleri kullanır. Talep tahmini, dinamik fiyatlama veya öğrenen sıralama bilinçli olarak yoktur.

Dağıtım zamanlayıcısı (`dispatchPlugin`) saniyede bir çalışır ve **tek instance** varsayar. Yatay ölçeklemede bu döngü tek bir lider işlemde yürütülmelidir (ör. Redis tabanlı kilit); teklif tekilliği veritabanındaki kısmi tekil indekslerle zaten güvence altındadır. Realtime yayın süreç içi bellekte tutulur; çok instance'lı kurulumda Redis pub/sub köprüsü gerekir.

Vercel Functions kalıcı WebSocket sunmadığı için realtime API uzun yaşayan Node/container ortamında veya managed realtime serviste çalıştırılmalıdır. Public OSM servisleri geliştirme içindir; production trafiğinde managed/self-hosted provider seçilmelidir. Ödeme tahsilatı, sürücü ödeme çekme, kampanya ve rezervasyon henüz yoktur. Güvenli aramada numara arayüzde maskelenir; gerçek proxy/anonim numara servisi sonraki fazdadır.

Mobil uygulamalar responsive ve dokunmatik önceliklidir. Store paketlemesi için sonraki fazda Capacitor/native kabuk, OS güvenli token saklama, push notification ve platform izinleri eklenebilir. Vercel test kurulumu için `docs/VERCEL.md` dosyasına bakın.
