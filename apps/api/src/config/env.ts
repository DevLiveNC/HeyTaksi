import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { isVercelRuntime } from './runtime.js';

// npm workspace scriptleri apps/api içinde çalışır; README ise .env'in repo kökünde
// oluşturulmasını belirtir. Her iki konuma da bakıyoruz (cwd öncelikli, mevcut
// ortam değişkenleri hiçbir zaman ezilmez).
const configDir = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(configDir, '../../../../.env')]) {
  if (existsSync(candidate)) dotenv.config({ path: candidate });
}

if (!process.env.DATABASE_URL) {
  const fromPostgres = process.env.POSTGRES_URL ?? process.env.POSTGRES_PRISMA_URL;
  if (fromPostgres) process.env.DATABASE_URL = fromPostgres;
}

const onVercel = isVercelRuntime();

const optionalKey = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(10).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  DATABASE_URL: z.string().min(1).default('postgresql://heytaksi:heytaksi@localhost:5432/heytaksi'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(onVercel ? 0 : 2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(onVercel ? 5 : 20),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32).default('development-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(32).default('development-refresh-secret-change-me'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  OTP_SECRET: z.string().min(32).default('development-otp-secret-change-me-now'),
  OTP_TTL_MINUTES: z.coerce.number().int().min(2).max(15).default(5),
  OTP_EXPOSE_CODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  OTP_PROVIDER_WEBHOOK_URL: z.url().optional(),
  OTP_PROVIDER_API_KEY: z.string().min(1).optional(),
  GEOCODING_URL: z.url().default('https://nominatim.openstreetmap.org'),
  ROUTING_URL: z.url().default('https://router.project-osrm.org'),
  MAP_SERVICE_USER_AGENT: z.string().default('HeyTaksi/0.1 support@heytaksi.app'),
  // Sağlayıcı erişilemezse geliştirme ortamında yaklaşık rota/adres üretir; production'da kapatılır.
  MAP_FALLBACK: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  /** Sunucu tarafı Directions / Geocoding. Boşsa OSM (Nominatim + OSRM) kullanılır. */
  GOOGLE_MAPS_API_KEY: optionalKey,
  /** Maps JavaScript API anahtarı; kimliği doğrulanmış istemcilere `/locations/maps-config` ile verilir. */
  GOOGLE_MAPS_BROWSER_KEY: optionalKey,
  /** Cloud tabanlı harita stili (AdvancedMarker için gerekli olabilir). */
  GOOGLE_MAPS_MAP_ID: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /** Varsayılan osm: Google Maps sonra bağlanacak. */
  MAP_PROVIDER: z.enum(['osm', 'google']).default('osm'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Environment yapılandırması geçersiz:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  DATABASE_URL: parsed.data.DATABASE_URL.replace(/([?&])channel_binding=require&?/, '$1').replace(/[?&]$/, ''),
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};
export type Environment = typeof env;
