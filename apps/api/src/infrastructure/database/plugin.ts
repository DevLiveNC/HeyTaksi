import fp from 'fastify-plugin';
import pg from 'pg';
import { env } from '../../config/env.js';

const { Pool } = pg;

export const databasePlugin = fp(async (app) => {
  const neon = /neon\.tech|sslmode=require/i.test(env.DATABASE_URL);
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    min: env.DATABASE_POOL_MIN,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: neon ? { rejectUnauthorized: true } : undefined,
  });
  pool.on('error', (error) => app.log.error({ err: error }, 'PostgreSQL pool hatası'));
  app.decorate('db', pool);
  app.addHook('onClose', async () => pool.end());
}, { name: 'database' });
