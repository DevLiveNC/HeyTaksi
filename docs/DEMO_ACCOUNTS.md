# HeyTaksi Demo Hesapları

Tüm hesap türleri için oluşturulan demo hesaplar. Bu hesaplar `npm run db:seed-all-demo` komutu ile veritabanına eklenir.

## Kurulum

```bash
cp .env.example .env
# .env içindeki DATABASE_URL ve diğer ayarları kontrol et
docker compose up -d postgres redis
npm run db:migrate
npm run db:seed-all-demo
```

Komut idempotent'tir - aynı e-posta varsa şifreyi günceller, yoksa oluşturur.

## Demo Hesap Listesi

| # | Rol | E-posta | Şifre | Telefon | Ad Soyad | Açıklama |
|---|-----|---------|-------|---------|----------|----------|
| 1 | **passenger** | `passenger.demo@heytaksi.com` | `PassengerDemo2026!` | +905551110001 | Demo Yolcu | Yolcu uygulaması - yolculuk talep etme, cüzdan, profil |
| 2 | **driver** | `driver.demo@heytaksi.com` | `DriverDemo2026!` | +905331110002 | Demo Sürücü | Sürücü uygulaması - teklif kabul, navigasyon, kazanç. Araç: HT001 Toyota Corolla 2023 Beyaz |
| 3 | **admin** | `admin.demo@heytaksi.com` | `AdminDemo2026!` | +905551110003 | Demo Admin | Tam yetkili yönetici - tüm yönetim paneli erişimi, super_admin |
| 4 | **dispatcher** | `dispatcher.demo@heytaksi.com` | `DispatcherDemo2026!` | +905551110004 | Demo Dispatcher | Operasyon görevlisi - dispatch yönetimi, admin paneli erişimi |
| 5 | **support** | `support.demo@heytaksi.com` | `SupportDemo2026!` | +905551110005 | Demo Support | Destek görevlisi - destek kayıtları yönetimi |

### Ek Mevcut Demo Hesaplar (seed-demo ve seed-admin)

| Rol | E-posta | Şifre | Kaynak |
|-----|---------|-------|--------|
| driver | `driver@heytaksi.com` | `HeyTaksi2026` | `npm run db:seed-demo` |
| passenger | `passenger@heytaksi.com` | `HeyTaksi2026` | `npm run db:seed-demo` |
| admin | `admin@heytaksi.com` | `.env ADMIN_PASSWORD` | `npm run db:seed-admin` |

## Giriş Yapma

### API ile

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "passenger.demo@heytaksi.com",
    "password": "PassengerDemo2026!",
    "device": {
      "id": "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      "platform": "web"
    }
  }'
```

Dönen `accessToken` ve `refreshToken` ile diğer endpointlere erişebilirsiniz.

### Frontend ile

- Yolcu: http://localhost:5173 - passenger.demo@heytaksi.com ile giriş
- Sürücü: http://localhost:5174 - driver.demo@heytaksi.com ile giriş
- Admin: http://localhost:5175 - admin.demo@heytaksi.com / dispatcher.demo@heytaksi.com / support.demo@heytaksi.com ile giriş

## Roller ve Yetkiler

`packages/shared/src/index.ts` içindeki roller:

- **passenger**: `profile:read`, `profile:update`, `rides:create`, `rides:read`, `rides:cancel`, `rides:message`, `rides:rate`
- **driver**: `profile:read`, `profile:update`, `rides:read`, `rides:operate`, `rides:accept`, `rides:message`, `rides:rate`, `drivers:duty`
- **admin**: tüm yetkiler (super_admin)
- **dispatcher**: `admin:access`, `users:read`, `dispatch:manage`
- **support**: `admin:access`, `users:read`, `support:manage`

## Güvenlik Notları

- Tüm şifreler Argon2 ile hashlenir
- Demo hesaplar sadece development/test ortamı içindir
- Production ortamında bu hesapları oluşturmayın veya hemen devre dışı bırakın
- Şifreler en az 10 karakter, büyük/küçük harf ve rakam içerir (passwordSchema uyumlu)

## Seed Dosyası

Kaynak: `apps/api/src/infrastructure/database/seed-all-demo.ts`

- `users` tablosuna 5 hesap ekler
- `user_profiles` oluşturur
- `drivers` ve `vehicles` sürücü için oluşturur
- `admin_users` admin/dispatcher/support için oluşturur
- Idempotent: ON CONFLICT DO UPDATE kullanır
