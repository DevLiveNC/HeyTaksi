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
- `VITE_WS_URL=wss://<realtime-domain>/ws`
- `VITE_MAP_STYLE_URL=https://<map-provider>/style`

API Project'ine Neon `DATABASE_URL` (veya Vercel Postgres `POSTGRES_URL`) ile `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` eklenmelidir. `CORS_ORIGINS` içine frontend origin'lerini yazabilirsiniz; Hey Taksi `*.vercel.app` hostları ayrıca otomatik kabul edilir.

## Neon PostgreSQL

`DATABASE_URL` yalnızca Vercel'in şifreli Environment Variables alanına eklenmelidir. Credential repoya veya frontend değişkenlerine yazılmamalıdır. Migration deploy öncesi güvenilir bir CI/yerel ortamdan bir kez çalıştırılır:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' npm run db:seed-all-demo
```

Paylaşılan/veri sızıntısı şüphesi olan PostgreSQL parolası önce Neon panelinden rotate edilmelidir.

## Platform sınırı

Vercel Functions kalıcı WebSocket bağlantısı barındırmaz. Faz 2 REST/auth testleri Vercel'de çalışır; `/ws` lokal veya uzun yaşayan container ortamında çalışır. Realtime production testi için Ably, Pusher, Soketi veya ayrı container servisi kullanılmalıdır. Hosted Redis kullanılıyorsa `REDIS_URL` TLS destekli sağlayıcı adresi olmalıdır.


## Neon PostgreSQL

`DATABASE_URL` yalnızca Vercel'in şifreli Environment Variables alanına eklenmelidir. Credential repoya veya frontend değişkenlerine yazılmamalıdır. Migration deploy öncesi güvenilir bir CI/yerel ortamdan bir kez çalıştırılır:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' ADMIN_EMAIL='...' ADMIN_PASSWORD='...' npm run db:seed-admin
```

Paylaşılan/veri sızıntısı şüphesi olan PostgreSQL parolası önce Neon panelinden rotate edilmelidir.

## Platform sınırı

Vercel Functions kalıcı WebSocket bağlantısı barındırmaz. Faz 2 REST/auth testleri Vercel'de çalışır; `/ws` lokal veya uzun yaşayan container ortamında çalışır. Realtime production testi için Ably, Pusher, Soketi veya ayrı container servisi kullanılmalıdır. Hosted Redis kullanılıyorsa `REDIS_URL` TLS destekli sağlayıcı adresi olmalıdır.
