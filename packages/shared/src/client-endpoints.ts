/**
 * Frontend API/WS adreslerini güvenli hale getirir.
 *
 * Vercel'de `VITE_API_URL=https://hey-taksi.vercel.app/api/v1` gibi bir değer
 * (yolcu/yönetim SPA'sı, API değil) tarayıcıda CORS'suz 404 üretir; fetch
 * `Failed to fetch` / `Load failed` fırlatır ve giriş "Sunucuya bağlanılamadı"
 * olarak görünür. Aynı origin `/api` proxy'si gerçek API'ye gider.
 *
 * Capacitor kabuğunda aynı origin proxy yoktur; boş veya SPA hostu native
 * varsayılanına (`PRODUCTION_API_BASE`) düşer.
 */

import { PRODUCTION_API_BASE, PRODUCTION_WS_URL } from './native-shell.js';

const FRONTEND_PROJECTS = [
  'hey-taksi-admin',
  'hey-taksi-passenger',
  'hey-taksi-driver',
  'heytaksi-admin',
  'heytaksi-passenger',
  'heytaksi-driver',
] as const;

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/** `hey-taksi.vercel.app` ve yönetim/yolcu/sürücü SPA hostları — API değildir. */
export function isHeyTaksiFrontendHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'hey-taksi.vercel.app' || host === 'heytaksi.vercel.app') return true;
  return FRONTEND_PROJECTS.some((name) => host === `${name}.vercel.app` || host.startsWith(`${name}-`));
}

export function resolveApiBaseUrl(
  configured?: string | null,
  options?: { native?: boolean },
): string {
  const native = options?.native === true;
  const raw = configured?.trim().replace(/\/$/, '');
  if (!raw) return native ? PRODUCTION_API_BASE : '/api/v1';
  if (raw.startsWith('/')) return native ? PRODUCTION_API_BASE : raw;
  const hostname = hostnameOf(raw);
  if (!hostname || isHeyTaksiFrontendHost(hostname)) {
    return native ? PRODUCTION_API_BASE : '/api/v1';
  }
  return raw;
}

export function resolveWsBaseUrl(
  configured: string | undefined | null,
  location: Pick<URL, 'protocol' | 'host'>,
  options?: { native?: boolean },
): string {
  const native = options?.native === true;
  const raw = configured?.trim();
  if (raw) {
    const hostname = hostnameOf(raw);
    if (hostname && !isHeyTaksiFrontendHost(hostname)) return raw;
  }
  if (native) return PRODUCTION_WS_URL;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
