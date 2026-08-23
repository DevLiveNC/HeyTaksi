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

## Faz sınırı

Bu sürüm temel kimlik doğrulama (kayıt, giriş, token yenileme, profil), rol kontrolü, migration, standart hata/validation/logging, health check ve WebSocket ping/pong altyapısını içerir. Ödeme, GPS, AI, ayrıntılı yolculuk, kampanya ve rezervasyon iş kuralları bilerek eklenmemiştir.

Mobil uygulamalar responsive ve dokunmatik öncelikli hazırlanmıştır. Store paketlemesi için Faz 2'de Capacitor/native kabuk, güvenli cihaz token saklama, push notification ve platform izinleri eklenebilir.
