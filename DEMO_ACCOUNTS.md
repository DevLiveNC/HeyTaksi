# HeyTaksi - Tüm Roller İçin Demo Hesaplar

`npm run db:seed-all-demo` komutu ile oluşturulan hesaplar.

## Hızlı Kurulum

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npm run db:migrate
npm run db:seed-all-demo
```

## Hesap Bilgileri

### 1. Yolcu (Passenger)
- **E-posta:** `passenger.demo@heytaksi.com`
- **Şifre:** `PassengerDemo2026!`
- **Telefon:** +905551110001
- **Ad Soyad:** Demo Yolcu
- **Rol:** passenger
- **Giriş:** Yolcu uygulaması http://localhost:5173 veya `POST /api/v1/auth/login`

### 2. Sürücü (Driver)
- **E-posta:** `driver.demo@heytaksi.com`
- **Şifre:** `DriverDemo2026!`
- **Telefon:** +905331110002
- **Ad Soyad:** Demo Sürücü
- **Rol:** driver
- **Araç:** HT001 - Toyota Corolla 2023 Beyaz (standard)
- **Durum:** verified, rating 4.92, offline
- **Giriş:** Sürücü uygulaması http://localhost:5174

### 3. Admin (Tam Yetkili)
- **E-posta:** `admin.demo@heytaksi.com`
- **Şifre:** `AdminDemo2026!`
- **Telefon:** +905551110003
- **Ad Soyad:** Demo Admin
- **Rol:** admin (super_admin = true)
- **Departman:** Yönetim
- **Yetkiler:** Tüm yetkiler
- **Giriş:** Admin paneli http://localhost:5175

### 4. Dispatcher (Operasyon)
- **E-posta:** `dispatcher.demo@heytaksi.com`
- **Şifre:** `DispatcherDemo2026!`
- **Telefon:** +905551110004
- **Ad Soyad:** Demo Dispatcher
- **Rol:** dispatcher
- **Departman:** Operasyon
- **Yetkiler:** admin:access, users:read, dispatch:manage
- **Giriş:** Admin paneli http://localhost:5175

### 5. Support (Destek)
- **E-posta:** `support.demo@heytaksi.com`
- **Şifre:** `SupportDemo2026!`
- **Telefon:** +905551110005
- **Ad Soyad:** Demo Support
- **Rol:** support
- **Departman:** Destek
- **Yetkiler:** admin:access, users:read, support:manage
- **Giriş:** Admin paneli http://localhost:5175

## API Login Örneği

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

Yanıt:
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "passenger.demo@heytaksi.com", "role": "passenger", ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresAt": "..."
  }
}
```

## Diğer Mevcut Demo Hesaplar

- `driver@heytaksi.com` / `HeyTaksi2026` (seed-demo)
- `passenger@heytaksi.com` / `HeyTaksi2026` (seed-demo)
- `admin@heytaksi.com` / (ADMIN_PASSWORD env) (seed-admin)

## Dosyalar

- Seed script: `apps/api/src/infrastructure/database/seed-all-demo.ts`
- Detaylı doküman: `docs/DEMO_ACCOUNTS.md`
- JSON: `docs/demo-accounts.json`
