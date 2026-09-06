# Vercel test deployment

Monorepo Vercel'de dört ayrı Project olarak bağlanır. Hepsi aynı GitHub repository'sine (`DevLiveNC/HeyTaksi`) bağlıdır; **Root Directory** aşağıdaki gibidir:

| Project | Root Directory | Production URL |
|---|---|---|
| hey-taksi-api | `apps/api` | https://hey-taksi-api.vercel.app |
| hey-taksi-passenger | `apps/passenger` | https://hey-taksi-passenger.vercel.app |
| hey-taksi-driver | `apps/driver` | https://hey-taksi-driver.vercel.app |
| hey-taksi-admin | `apps/admin` | https://hey-taksi-admin.vercel.app |

Frontend SPA rewrite `/api` yollarını **hariç tutar**; aksi halde `POST /api/v1/auth/login` statik `index.html`'e düşer ve Vercel **405 Method Not Allowed** döner.

`API_ORIGIN` tanımsızsa frontend `/api` proxy'si `https://hey-taksi-api.vercel.app` adresine gider. Override için frontend Project'lerine:

- `API_ORIGIN=https://hey-taksi-api.vercel.app` (path yok)
- `VITE_API_URL=https://hey-taksi-api.vercel.app/api/v1` (doğrudan API; build zamanında gerekir)
- `VITE_API_URL` **API proje hostu** olmalıdır (`hey-taksi-api.vercel.app`). `https://hey-taksi.vercel.app` bir SPA alias'ıdır; API yoktur ve yönetim girişi tarayıcıda "Sunucuya bağlanılamadı" gösterir. Yanlış host verilirse uygulama aynı origin `/api` proxy'sine düşer.
- `VITE_WS_URL=wss://<realtime-domain>/ws`
- `VITE_MAP_PROVIDER=osm` (OpenStreetMap/MapLibre; anahtar gerekmez). Düz renk harita için önce dashboard’da bunun `google` kalmadığını kontrol edin.
- `VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty` (Türkçe etiket + POI)
- `VITE_GOOGLE_MAPS_API_KEY=` yalnızca `VITE_MAP_PROVIDER=google` iken zorunlu (Maps JavaScript API, HTTP referrer kısıtlı)
- API Project: `MAP_PROVIDER=osm`, `GEOCODING_URL=https://nominatim.openstreetmap.org`, `ROUTING_URL=https://router.project-osrm.org`. Google’a geçince `MAP_PROVIDER=google` + `GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_BROWSER_KEY`

Bu OSM değerleri ayrıca her frontend `vercel.json` / `.env.production` ve API `vercel.json` `env` alanına yazılmıştır; bir sonraki deploy’da build’e girer. **Vercel Project → Environment Variables** içinde `VITE_MAP_PROVIDER=google` varsa onu `osm` yapın veya silin; panel değeri `vercel.json`’daki osm varsayılanını ezer ve Google anahtarı yoksa harita boş/düz renk kalır.

API Project'ine Neon `DATABASE_URL` (veya Vercel Postgres `POSTGRES_URL`) ile `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` eklenmelidir. `CORS_ORIGINS` içine frontend origin'lerini yazabilirsiniz; Hey Taksi `*.vercel.app` hostları ayrıca otomatik kabul edilir.

## Performans (Fluid Compute)

Tüm projeler `fra1` (Frankfurt) bölgesinde çalışır. `functionFailoverRegions` yalnızca Enterprise planda vardır; Hobby/Pro deploy’u “passive regions” hatasıyla düşer. `fluid: true` ile instance'lar istekler arasında yeniden kullanılır.

- **SPA CDN:** Vite hash'li `/assets/*` dosyaları `immutable` (1 yıl) önbelleğe alınır; `index.html` her deploy'da yeniden doğrulanır.
- **Monorepo ignore:** Yalnızca ilgili `apps/*` + `packages/*` değişince o proje build olur (`scripts/vercel-ignore.mjs`).
- **API soğuk başlangıç:** Vercel'de `REDIS_URL` localhost ise Redis'e bağlanılmaz (aksi halde ~10 sn timeout). Swagger UI yüklenmez. PostgreSQL havuzu 3 bağlantı ile sınırlıdır; Neon **pooled** (`-pooler`) connection string kullanın.
- **Dispatch:** Functions idle iken `setInterval` çalışmaz. Ride/dispatch isteklerinde arka planda `sweep` çalışır. Pro planda dakikalık cron için dashboard’a `GET /api/v1/dispatch/tick` ekleyin (`CRON_SECRET` Bearer). Hobby’de cron günde birdir; `vercel.json` içine yazılmaz.
- **Harita:** MapLibre giriş ekranı paketinden ayrılır. Nominatim/OSRM yanıtları instance içinde kısa TTL ile önbelleğe alınır.
- **Gözlem:** Production SPA `AuthProvider` içinde Vercel Analytics + Speed Insights enjekte eder. Dashboard'da her frontend proje için Speed Insights'ı açın.

## Neon PostgreSQL

`DATABASE_URL` yalnızca Vercel'in şifreli Environment Variables alanına eklenmelidir. Credential repoya veya frontend değişkenlerine yazılmamalıdır. Serverless için Neon **connection pooler** URL'sini kullanın (`-pooler` host, `sslmode=require`). Migration deploy öncesi güvenilir bir CI/yerel ortamdan bir kez çalıştırılır:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' npm run db:seed-all-demo
```

Paylaşılan/veri sızıntısı şüphesi olan PostgreSQL parolası önce Neon panelinden rotate edilmelidir.

## Platform sınırı

Vercel Functions kalıcı, çok instance'lı WebSocket ağı barındırmaz: Fluid Compute bir bağlantıyı instance süresince tutabilir ama reconnect ve pub/sub için Redis (veya Ably/Pusher/Soketi) gerekir. Faz 2 REST/auth testleri Vercel'de çalışır. Hosted Redis kullanılıyorsa `REDIS_URL` TLS destekli sağlayıcı adresi olmalıdır; verilmezse konum defteri PostgreSQL yedeğine düşer.

Hobby planda cron en fazla günde bir çalışır. Dakikalık dispatch taraması Pro panelinden eklenir; `vercel.json` içinde tutulmaz ki Hobby deploy düşmesin.
