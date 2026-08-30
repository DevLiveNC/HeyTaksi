/**
 * Frontend API/WS adreslerini güvenli hale getirir.
 *
 * Vercel'de `VITE_API_URL=https://hey-taksi.vercel.app/api/v1` gibi bir değer
 * (yolcu/yönetim SPA'sı, API değil) tarayıcıda CORS'suz 404 üretir; fetch
 * `Failed to fetch` / `Load failed` fırlatır ve giriş "Sunucuya bağlanılamadı"
 * olarak görünür. Aynı origin `/api` proxy'si gerçek API'ye gider.
 */

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

export function resolveApiBaseUrl(configured?: string | null): string {
  const raw = configured?.trim().replace(/\/$/, '');
  if (!raw) return '/api/v1';
  if (raw.startsWith('/')) return raw;
  const hostname = hostnameOf(raw);
  if (!hostname || isHeyTaksiFrontendHost(hostname)) return '/api/v1';
  return raw;
}

export function resolveWsBaseUrl(
  configured: string | undefined | null,
  location: Pick<URL, 'protocol' | 'host'>,
): string {
  const raw = configured?.trim();
  if (raw) {
    const hostname = hostnameOf(raw);
    if (hostname && !isHeyTaksiFrontendHost(hostname)) return raw;
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/ws`;
}
