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
