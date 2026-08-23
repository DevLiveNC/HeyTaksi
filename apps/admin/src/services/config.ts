// Yönetim paneli API/WS adresi ortam değişkeninden alınır; yoksa aynı origin (Vite proxy) kullanılır.
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

export const wsBaseUrl = (() => {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
})();

export const mapStyleUrl =
  (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ?? 'https://tiles.openfreemap.org/styles/dark';
