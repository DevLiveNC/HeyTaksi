import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  DATABASE_URL: z.string().min(1).default('postgresql://heytaksi:heytaksi@localhost:5432/heytaksi'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
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
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Environment yapılandırması geçersiz:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};
export type Environment = typeof env;
