# Vercel test deployment

Monorepo Vercel'de dört ayrı Project olarak bağlanır. Her Project aynı Git repository/branch'i kullanır ve **Root Directory** aşağıdaki gibi seçilir:

| Project | Root Directory | Açıklama |
|---|---|---|
| heytaksi-api | `apps/api` | REST API ve auth |
| heytaksi-passenger | `apps/passenger` | Yolcu web uygulaması |
| heytaksi-driver | `apps/driver` | Sürücü web uygulaması |
| heytaksi-admin | `apps/admin` | Yönetim paneli |

Her dizindeki `vercel.json` build ve SPA rewrite ayarlarını içerir. Frontend catch-all rewrite `/api` yollarını **hariç tutar**; aksi halde `POST /api/v1/auth/login` statik `index.html`'e düşer ve Vercel **405 Method Not Allowed** döner (yönetim panelinde form + üç demo hesabı = dört giriş isteği).

Frontend Project'lerine:

- `VITE_API_URL=https://<api-domain>/api/v1` (veya boş bırakıp aynı origin `/api/v1` kullanın)
- `API_ORIGIN=https://<api-domain>` (aynı origin `/api` proxy'si için; `VITE_API_URL` yoksa zorunlu)
- `VITE_WS_URL=wss://<realtime-domain>/ws`
- `VITE_MAP_STYLE_URL=https://<map-provider>/style`

API Project'ine `.env.example` içindeki server değişkenleri Vercel Environment Variables üzerinden eklenir. `CORS_ORIGINS` içine frontend origin'lerini yazın; Hey Taksi `*.vercel.app` önizleme/production hostları ayrıca otomatik kabul edilir.


## Neon PostgreSQL

`DATABASE_URL` yalnızca Vercel'in şifreli Environment Variables alanına eklenmelidir. Credential repoya veya frontend değişkenlerine yazılmamalıdır. Migration deploy öncesi güvenilir bir CI/yerel ortamdan bir kez çalıştırılır:

```bash
DATABASE_URL='postgresql://...' npm run db:migrate
DATABASE_URL='postgresql://...' ADMIN_EMAIL='...' ADMIN_PASSWORD='...' npm run db:seed-admin
```

Paylaşılan/veri sızıntısı şüphesi olan PostgreSQL parolası önce Neon panelinden rotate edilmelidir.

## Platform sınırı

Vercel Functions kalıcı WebSocket bağlantısı barındırmaz. Faz 2 REST/auth testleri Vercel'de çalışır; `/ws` lokal veya uzun yaşayan container ortamında çalışır. Realtime production testi için Ably, Pusher, Soketi veya ayrı container servisi kullanılmalıdır. Hosted Redis kullanılıyorsa `REDIS_URL` TLS destekli sağlayıcı adresi olmalıdır.
