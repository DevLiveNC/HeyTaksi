import { resolveApiBaseUrl, resolveWsBaseUrl } from "@heytaksi/shared";

// Frontend API/WS adresi ortam değişkeninden alınır; frontend hostuna işaret
// ederse aynı origin (Vite / Vercel /api proxy) kullanılır.
export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export const wsBaseUrl = resolveWsBaseUrl(import.meta.env.VITE_WS_URL as string | undefined, window.location);
