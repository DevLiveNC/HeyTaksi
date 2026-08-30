import { resolveApiBaseUrl, resolveWsBaseUrl } from '@heytaksi/shared';

// Yönetim paneli API/WS adresi ortam değişkeninden alınır; frontend hostuna
// (ör. hey-taksi.vercel.app) işaret ederse aynı origin /api proxy'si kullanılır.
export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export const wsBaseUrl = resolveWsBaseUrl(import.meta.env.VITE_WS_URL as string | undefined, window.location);

export const mapStyleUrl =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ?? 'https://tiles.openfreemap.org/styles/dark';
