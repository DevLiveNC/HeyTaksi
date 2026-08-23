// Sürücü uygulaması API ve WebSocket adresini ortam değişkeninden alır;
// verilmezse aynı origin üzerinden Vite proxy'sini kullanır (preview/lokal geliştirme).
export const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "/api/v1";

export const wsBaseUrl = (() => {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
})();
