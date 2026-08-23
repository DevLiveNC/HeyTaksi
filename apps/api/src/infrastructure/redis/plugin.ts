import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { env } from '../../config/env.js';

export const redisPlugin = fp(async (app) => {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2, enableOfflineQueue: false });
  redis.on('error', (error) => app.log.error({ err: error }, 'Redis bağlantı hatası'));
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    if (redis.status === 'ready') await redis.quit();
    else redis.disconnect(false);
  });
}, { name: 'redis' });
