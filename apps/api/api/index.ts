import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import { restoreServerlessUrl } from '../src/core/http/serverless-url.js';

// Warm function çağrılarında Fastify ve bağlantı havuzları yeniden kullanılır.
const appPromise = buildApp().then(async (app) => { await app.ready(); return app; });

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  request.url = restoreServerlessUrl(request.url, request.headers);
  app.server.emit('request', request, response);
}
