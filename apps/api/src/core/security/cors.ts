import type { FastifyCorsOptions } from '@fastify/cors';

const vercelProjects = ['hey-taksi-api', 'hey-taksi-passenger', 'hey-taksi-driver', 'hey-taksi-admin', 'heytaksi-api', 'heytaksi-passenger', 'heytaksi-driver', 'heytaksi-admin'];

function isHeyTaksiVercelHost(hostname: string) {
  if (!hostname.endsWith('.vercel.app')) return false;
  return vercelProjects.some((name) => hostname === `${name}.vercel.app` || hostname.startsWith(`${name}-`));
}

/** Same-origin, listed origins, localhost, and Hey Taksi Vercel production/preview hosts. */
export function isAllowedCorsOrigin(origin: string | undefined, allowed: string[]) {
  if (!origin) return true;
  if (allowed.includes('*') || allowed.includes(origin)) return true;
  let parsed: URL;
  try { parsed = new URL(origin); } catch { return false; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
  return isHeyTaksiVercelHost(parsed.hostname);
}

export function corsPluginOptions(allowedOrigins: string[]): FastifyCorsOptions {
  return {
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin, allowedOrigins));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 86_400,
    strictPreflight: false,
  };
}
