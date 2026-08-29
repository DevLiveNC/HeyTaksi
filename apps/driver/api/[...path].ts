import type { IncomingMessage, ServerResponse } from 'node:http';

const hopByHop = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function readBody(request: IncomingMessage) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function allowOrigin(origin: string | undefined) {
  return origin && origin !== 'null' ? origin : '*';
}

/**
 * Vercel SPA projects rewrite unknown POST paths to index.html, which returns 405.
 * This function owns `/api/*` so login and other API methods never hit static files.
 */
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  if (request.method === 'OPTIONS') {
    const requested = request.headers['access-control-request-headers'];
    response.writeHead(204, {
      'access-control-allow-origin': allowOrigin(origin),
      'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      'access-control-allow-headers': typeof requested === 'string' ? requested : 'content-type,authorization,x-request-id',
      'access-control-allow-credentials': 'true',
      'access-control-max-age': '86400',
      vary: 'Origin',
    });
    response.end();
    return;
  }

  const apiOrigin = process.env.API_ORIGIN?.replace(/\/$/, '');
  if (!apiOrigin) {
    response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      success: false,
      error: {
        code: 'API_UNAVAILABLE',
        message: 'API adresi yapılandırılmamış. Vercel projesine API_ORIGIN ekleyin.',
      },
    }));
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || hopByHop.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request);
  const upstream = await fetch(`${apiOrigin}${request.url ?? '/'}`, { method, headers, body, redirect: 'manual' });

  response.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) return;
    response.setHeader(key, value);
  });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}
