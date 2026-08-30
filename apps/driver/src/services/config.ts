import { resolveApiBaseUrl, resolveWsBaseUrl } from "@heytaksi/shared";

// Sürücü uygulaması API ve WebSocket adresini ortam değişkeninden alır;
// frontend hostuna işaret ederse aynı origin üzerinden proxy kullanılır.
export const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export const wsBaseUrl = resolveWsBaseUrl(import.meta.env.VITE_WS_URL as string | undefined, window.location);
