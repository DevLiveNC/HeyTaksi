import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { env } from './config/env.js';
import { registerErrorHandler } from './core/plugins/error-handler.js';
import { corsPluginOptions } from './core/security/cors.js';
import { authPlugin } from './core/security/auth.plugin.js';
import { databasePlugin } from './infrastructure/database/plugin.js';
import { redisPlugin } from './infrastructure/redis/plugin.js';
import { realtimeRoutes } from './infrastructure/realtime/routes.js';
import { realtimeHubPlugin } from './infrastructure/realtime/hub.js';
import { dispatchPlugin } from './modules/dispatch/dispatch.plugin.js';
import { apiModules } from './modules/index.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, requestIdHeader: 'x-request-id', trustProxy: true, ignoreTrailingSlash: true });
  registerErrorHandler(app);
  await app.register(cors, corsPluginOptions(env.CORS_ORIGINS));
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' }, crossOriginEmbedderPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(sensible);
  await app.register(swagger, { openapi: { info: { title: 'Hey Taksi API', version: '0.1.0' } } });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(websocket);
  await app.register(databasePlugin);
  await app.register(redisPlugin);
  await app.register(authPlugin);
  await app.register(realtimeHubPlugin);
  await app.register(dispatchPlugin);

  app.get('/health/live', async () => ({ status: 'ok', service: 'heytaksi-api', timestamp: new Date().toISOString() }));
  app.get('/health/ready', async (_request, reply) => {
    const [database, redis] = await Promise.allSettled([app.db.query('SELECT 1'), app.redis.ping()]);
    const ready = database.status === 'fulfilled' && redis.status === 'fulfilled';
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'degraded', dependencies: { database: database.status, redis: redis.status } });
  });
  await app.register(realtimeRoutes, { prefix: '/ws' });
  await app.register(apiModules, { prefix: env.API_PREFIX });
  return app;
}
