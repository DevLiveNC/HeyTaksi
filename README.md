# Hey Taksi

Hey Taksi; yolcu, sürücü ve operasyon ekiplerini aynı platformda buluşturmak üzere tasarlanmış TypeScript monoreposudur. Faz 1, ürün özelliklerinden önce ölçeklenebilir uygulama temelini kurar.

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
npm run db:seed-demo   # driver@heytaksi.com / HeyTaksi2026 (+ yolcu ve geçmiş yolculuklar)
```

## Faz sınırı

Temel eşleştirme doğrulanmış, çevrim içi ve uygun araç tipindeki sürücüyü puan/toplam yolculuğa göre seçer; gelişmiş AI dispatch içermez. Public OSM servisleri geliştirme içindir ve production trafiğinde kullanım politikasına uygun managed/self-hosted provider seçilmelidir. Vercel Functions kalıcı WebSocket sunmadığı için realtime API uzun yaşayan Node/container ortamında veya managed realtime serviste çalıştırılmalıdır. Ödeme tahsilatı, sürücü ödeme çekme, kampanya ve rezervasyon henüz yoktur. Güvenli aramada numara arayüzde maskelenir; gerçek proxy/anonim numara servisi sonraki fazdadır.

Mobil uygulamalar responsive ve dokunmatik önceliklidir. Store paketlemesi için sonraki fazda Capacitor/native kabuk, OS güvenli token saklama, push notification ve platform izinleri eklenebilir. Vercel test kurulumu için `docs/VERCEL.md` dosyasına bakın.
