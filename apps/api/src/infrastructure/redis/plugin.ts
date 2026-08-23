import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { env } from '../../config/env.js';

export const redisPlugin = fp(
  async (app) => {
    const redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      // Bağlantı koptuğunda komutlar hata döndürür; çağıranlar PostgreSQL'e düşer.
      enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    });
    redis.on('error', (error) => app.log.error({ err: error }, 'Redis bağlantı hatası'));
    redis.on('ready', () => app.log.info('Redis bağlantısı hazır'));

    // Faz 6: konum defteri Redis'i birincil kaynak olarak kullanır, bu yüzden
    // bağlantı açılışta kurulur. Redis yoksa API yine ayağa kalkar; store
    // otomatik olarak PostgreSQL'e düşer ve arka planda yeniden bağlanmayı dener.
    try {
      await redis.connect();
    } catch (error) {
      app.log.warn({ err: error }, 'Redis başlangıçta bağlanamadı; PostgreSQL yedeğiyle devam ediliyor.');
    }

    app.decorate('redis', redis);
    app.addHook('onClose', async () => {
      if (redis.status === 'ready') await redis.quit();
      else redis.disconnect(false);
    });
  },
  { name: 'redis' },
);
