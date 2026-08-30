import { describe, expect, it } from 'vitest';
import { isHeyTaksiFrontendHost, resolveApiBaseUrl, resolveWsBaseUrl } from '../../packages/shared/src/client-endpoints.ts';

describe('resolveApiBaseUrl', () => {
  it('uses the same-origin proxy when the variable is empty', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api/v1');
    expect(resolveApiBaseUrl('')).toBe('/api/v1');
    expect(resolveApiBaseUrl('  /api/v1/  ')).toBe('/api/v1');
  });

  it('keeps a real API origin', () => {
    expect(resolveApiBaseUrl('https://hey-taksi-api.vercel.app/api/v1')).toBe('https://hey-taksi-api.vercel.app/api/v1');
    expect(resolveApiBaseUrl('http://localhost:3000/api/v1')).toBe('http://localhost:3000/api/v1');
  });

  it('rejects the production misconfig that broke admin login', () => {
    expect(resolveApiBaseUrl('https://hey-taksi.vercel.app/api/v1')).toBe('/api/v1');
    expect(resolveApiBaseUrl('https://hey-taksi-admin.vercel.app/api/v1')).toBe('/api/v1');
    expect(resolveApiBaseUrl('https://hey-taksi-admin-4ku900qvw-devlivencs-projects.vercel.app/api/v1')).toBe('/api/v1');
  });
});

describe('isHeyTaksiFrontendHost', () => {
  it('does not treat the API project as a frontend', () => {
    expect(isHeyTaksiFrontendHost('hey-taksi-api.vercel.app')).toBe(false);
    expect(isHeyTaksiFrontendHost('hey-taksi-api-git-main-devlivencs-projects.vercel.app')).toBe(false);
  });
});

describe('resolveWsBaseUrl', () => {
  const admin = { protocol: 'https:', host: 'hey-taksi-admin.vercel.app' };

  it('falls back to the current origin when WS points at a frontend host', () => {
    expect(resolveWsBaseUrl('wss://hey-taksi.vercel.app/ws', admin)).toBe('wss://hey-taksi-admin.vercel.app/ws');
  });

  it('keeps an API websocket origin', () => {
    expect(resolveWsBaseUrl('wss://hey-taksi-api.vercel.app/ws', admin)).toBe('wss://hey-taksi-api.vercel.app/ws');
  });
});
