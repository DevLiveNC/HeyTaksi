import { resolveApiBaseUrl, resolveWsBaseUrl } from '@heytaksi/shared';
import { osmStyleUrl } from '@heytaksi/ui';

// Yönetim paneli API/WS adresi ortam değişkeninden alınır; frontend hostuna
// (ör. hey-taksi.vercel.app) işaret ederse aynı origin /api proxy'si kullanılır.
export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export const wsBaseUrl = resolveWsBaseUrl(import.meta.env.VITE_WS_URL as string | undefined, window.location);

export const mapStyleUrl = osmStyleUrl('light');
