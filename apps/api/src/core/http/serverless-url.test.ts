import { describe, expect, it } from 'vitest';
import { restoreServerlessUrl } from './serverless-url.js';

describe('restoreServerlessUrl', () => {
  it('keeps a public API path unchanged', () => {
    expect(restoreServerlessUrl('/api/v1/auth/login', {})).toBe('/api/v1/auth/login');
  });

  it('restores the original path when Vercel passes the function file path', () => {
    expect(restoreServerlessUrl('/api', { 'x-invoke-path': '/api/v1/auth/login' })).toBe('/api/v1/auth/login');
    expect(restoreServerlessUrl('/api/index.ts', { 'x-forwarded-uri': '/api/v1/auth/refresh' })).toBe('/api/v1/auth/refresh');
  });
});
