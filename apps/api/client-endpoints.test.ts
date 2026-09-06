import { describe, expect, it } from 'vitest';
import { isHeyTaksiFrontendHost, resolveApiBaseUrl, resolveWsBaseUrl } from '../../packages/shared/src/client-endpoints.ts';
import {
  PRODUCTION_API_BASE,
  PRODUCTION_WS_URL,
  isNativeAppLocation,
  nativeDevicePlatform,
} from '../../packages/shared/src/native-shell.ts';

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

  it('uses the production API host inside a native shell without a proxy', () => {
    expect(resolveApiBaseUrl(undefined, { native: true })).toBe(PRODUCTION_API_BASE);
    expect(resolveApiBaseUrl('/api/v1', { native: true })).toBe(PRODUCTION_API_BASE);
    expect(resolveApiBaseUrl('https://hey-taksi-passenger.vercel.app/api/v1', { native: true })).toBe(PRODUCTION_API_BASE);
    expect(resolveApiBaseUrl('https://hey-taksi-api.vercel.app/api/v1', { native: true })).toBe(
      'https://hey-taksi-api.vercel.app/api/v1',
    );
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

  it('does not point WebSocket at the Capacitor WebView host', () => {
    const native = { protocol: 'https:', host: 'localhost' };
    expect(resolveWsBaseUrl(undefined, native, { native: true })).toBe(PRODUCTION_WS_URL);
    expect(resolveWsBaseUrl('wss://hey-taksi-passenger.vercel.app/ws', native, { native: true })).toBe(PRODUCTION_WS_URL);
  });
});

describe('native shell origin', () => {
  it('recognizes Capacitor Android and iOS WebView locations', () => {
    expect(isNativeAppLocation({ protocol: 'https:', hostname: 'localhost', port: '' })).toBe(true);
    expect(isNativeAppLocation({ protocol: 'capacitor:', hostname: 'localhost', port: '' })).toBe(true);
    expect(isNativeAppLocation({ protocol: 'http:', hostname: 'localhost', port: '5173' })).toBe(false);
  });

  it('reads ios/android from the Capacitor bridge', () => {
    const win = {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
      location: { protocol: 'https:', hostname: 'localhost' },
    } as unknown as Window;
    expect(nativeDevicePlatform(win)).toBe('android');
  });
});
