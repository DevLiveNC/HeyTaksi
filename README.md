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

## Faz sınırı

Faz 3 kullanıcı/sürücü/admin authentication çekirdeğinin üstünde yolcu uygulamasının mobil-first arayüzünü tamamlar. Harita, taksi konumları, rota ve ödeme verileri temsili UI state'idir. Gerçek GPS, dispatch, ödeme, AI, kampanya, rezervasyon ve taksi çağırma iş kuralları bilerek eklenmemiştir.

Mobil uygulamalar responsive ve dokunmatik önceliklidir. Store paketlemesi için sonraki fazda Capacitor/native kabuk, OS güvenli token saklama, push notification ve platform izinleri eklenebilir. Vercel test kurulumu için `docs/VERCEL.md` dosyasına bakın.
