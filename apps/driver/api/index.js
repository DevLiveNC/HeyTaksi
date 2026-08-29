/**
 * Vercel SPA projects rewrite unknown POST paths to index.html, which returns 405.
 * This function owns `/api` so login and other API methods never hit static files.
 *
 * fetch() decompresses upstream bodies, so Content-Encoding must not be forwarded —
 * Safari reports that mismatch as TypeError: Load failed. Upstream fetch failures
 * must also be caught; an uncaught throw becomes FUNCTION_INVOCATION_FAILED.
 */

const hopByHop = new Set([
  'connection',
  'content-encoding',
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

const skipRequestHeaders = new Set([...hopByHop, 'accept-encoding']);

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function corsHeaders(origin, extra = {}) {
  const headers = {
    vary: 'Origin',
    'access-control-allow-methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    'access-control-max-age': '86400',
    ...extra,
  };
  if (origin && origin !== 'null') {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-credentials'] = 'true';
  }
  return headers;
}

function sendJson(response, status, payload, origin) {
  response.writeHead(status, corsHeaders(origin, { 'content-type': 'application/json; charset=utf-8' }));
  response.end(JSON.stringify(payload));
}

function publicApiUrl(request) {
  const fromQuery = (() => {
    const current = request.url ?? '/';
    const query = current.includes('?') ? current.slice(current.indexOf('?') + 1) : '';
    return new URLSearchParams(query).get('rest');
  })();
  if (fromQuery && fromQuery.startsWith('/api/')) return fromQuery;
  for (const name of ['x-forwarded-uri', 'x-invoke-path', 'x-vercel-original-path']) {
    const value = headerValue(request.headers[name]);
    if (value && value.startsWith('/api/')) return value;
  }
  return request.url ?? '/';
}

export default async function handler(request, response) {
  const origin = Array.isArray(request.headers.origin) ? request.headers.origin[0] : request.headers.origin;
  if (request.method === 'OPTIONS') {
    const requested = request.headers['access-control-request-headers'];
    response.writeHead(204, corsHeaders(origin, {
      'access-control-allow-headers': typeof requested === 'string' ? requested : 'content-type,authorization,x-request-id',
    }));
    response.end();
    return;
  }

  const apiOrigin = (process.env.API_ORIGIN || 'https://hey-taksi-api.vercel.app').replace(/\/$/, '');
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || skipRequestHeaders.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('accept-encoding', 'identity');

  const method = request.method ?? 'GET';
  try {
    const raw = method === 'GET' || method === 'HEAD' ? undefined : await readBody(request);
    const init = { method, headers, redirect: 'manual' };
    if (raw && raw.length > 0) {
      init.body = raw;
      init.duplex = 'half';
    }
    const upstream = await fetch(`${apiOrigin}${publicApiUrl(request)}`, init);
    response.statusCode = upstream.status;
    for (const [key, value] of Object.entries(corsHeaders(origin))) response.setHeader(key, value);
    upstream.headers.forEach((value, key) => {
      if (hopByHop.has(key.toLowerCase())) return;
      response.setHeader(key, value);
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    sendJson(response, 502, {
      success: false,
      error: {
        code: 'API_UNREACHABLE',
        message: 'Sunucuya bağlanılamadı. Lütfen birkaç saniye sonra tekrar deneyin.',
      },
    }, origin);
  }
}
