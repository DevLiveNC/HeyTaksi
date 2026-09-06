/** Vercel sets `VERCEL=1` on serverless builds and function invocations. */
export function isVercelRuntime(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL === '1';
}

/**
 * Swagger UI regularly exceeds Fastify's plugin timeout on Vercel cold starts,
 * crashing the function so the browser reports TypeError: Load failed.
 */
export function shouldServeApiDocs(env: NodeJS.ProcessEnv = process.env) {
  return !isVercelRuntime(env);
}

const localRedis = /^(redis|rediss):\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i;

/**
 * Vercel Functions freeze when idle; a process `setInterval` cannot expire
 * dispatch offers. Use request-time sweep + Cron instead.
 */
export function shouldRunDispatchTimer(env: NodeJS.ProcessEnv = process.env) {
  return !isVercelRuntime(env);
}

/**
 * Default `REDIS_URL=redis://localhost:6379` would block cold starts (~10s)
 * on Vercel when Redis is not provisioned.
 */
export function shouldConnectRedis(env: NodeJS.ProcessEnv = process.env, redisUrl = env.REDIS_URL) {
  const url = redisUrl?.trim() ?? '';
  if (!url) return false;
  if (isVercelRuntime(env) && localRedis.test(url)) return false;
  return true;
}
