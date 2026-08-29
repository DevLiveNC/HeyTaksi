import cors from '@fastify/cors';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { corsPluginOptions, isAllowedCorsOrigin } from './cors.js';

const listed = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

describe('isAllowedCorsOrigin', () => {
  it('allows missing origin, listed hosts, localhost, and Hey Taksi Vercel hosts', () => {
    expect(isAllowedCorsOrigin(undefined, listed)).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5173', listed)).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5175', listed)).toBe(true);
    expect(isAllowedCorsOrigin('https://hey-taksi-admin.vercel.app', listed)).toBe(true);
    expect(isAllowedCorsOrigin('https://hey-taksi-admin-git-main-devlivencs-projects.vercel.app', listed)).toBe(true);
    expect(isAllowedCorsOrigin('https://hey-taksi-passenger-2v4nsdl9k-devlivencs-projects.vercel.app', listed)).toBe(true);
  });

  it('rejects unrelated origins', () => {
    expect(isAllowedCorsOrigin('https://evil.example', listed)).toBe(false);
    expect(isAllowedCorsOrigin('https://hey-taksi-administration.vercel.app', listed)).toBe(false);
    expect(isAllowedCorsOrigin('https://not-hey-taksi-admin.vercel.app', listed)).toBe(false);
  });
});

describe('CORS preflight', () => {
  it('answers OPTIONS on a POST-only login route with 204 instead of 405', async () => {
    const app = Fastify();
    await app.register(cors, corsPluginOptions(listed));
    app.post('/api/v1/auth/login', async () => ({ ok: true }));
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: {
        origin: 'https://hey-taksi-admin.vercel.app',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://hey-taksi-admin.vercel.app');
    expect(String(response.headers['access-control-allow-methods'])).toMatch(/POST/);
    await app.close();
  });
});
