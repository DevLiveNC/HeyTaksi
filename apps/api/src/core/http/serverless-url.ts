import type { IncomingHttpHeaders } from 'node:http';

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isFunctionFilesystemPath(url: string) {
  const path = url.split('?')[0] ?? url;
  return path === '/api' || path === '/api/' || /^\/api\/index(\.ts)?\/?$/.test(path);
}

/**
 * Vercel sometimes delivers the serverless file path (`/api`) instead of the
 * original public URL. Restore `/api/v1/...` so Fastify matches the real route
 * instead of answering POST with 405/404.
 */
export function restoreServerlessUrl(url: string | undefined, headers: IncomingHttpHeaders) {
  const current = url && url.length > 0 ? url : '/';
  if (!isFunctionFilesystemPath(current)) return current;
  for (const name of ['x-invoke-path', 'x-forwarded-uri', 'x-vercel-original-url'] as const) {
    const original = headerValue(headers[name]);
    if (original && original.startsWith('/') && !isFunctionFilesystemPath(original)) {
      return original;
    }
  }
  return current;
}
