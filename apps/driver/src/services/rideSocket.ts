/**
 * Sürücü realtime bağlantısı.
 *
 * Akış: auth → driver.subscribe (+ aktif yolculuk kanalı) → konum sinyali akışı.
 * Konum artık REST yerine açık soket üzerinden gönderilir; bağlantı koparsa
 * üstel gecikmeyle yeniden bağlanılır ve abonelikler otomatik kurulur.
 */
export interface SocketHandlers {
  onStateChange?: (state: "connecting" | "live" | "offline") => void;
  onEvent: (event: string, data: unknown) => void;
}

export interface DriverLocationPing {
  latitude: number;
  longitude: number;
  heading?: number;
  speedMps?: number;
  accuracyMeters?: number;
  rideId?: string;
}

export interface DriverSocket {
  subscribeRide(rideId: string | null): void;
  /** Konumu soket üzerinden gönderir; soket kapalıysa false döner (çağıran REST'e düşebilir). */
  sendLocation(ping: DriverLocationPing): boolean;
  isLive(): boolean;
  close(): void;
}

const MAX_RETRY_MS = 15_000;

export function createDriverSocket(
  url: string,
  getToken: () => string | null,
  handlers: SocketHandlers,
): DriverSocket {
  let socket: WebSocket | null = null;
  let closed = false;
  let rideId: string | null = null;
  let retryTimer: number | undefined;
  let attempt = 0;
  let authenticated = false;

  const open = () => {
    const token = getToken();
    if (closed || !token) return;
    handlers.onStateChange?.("connecting");
    socket = new WebSocket(url);
    socket.onopen = () => {
      socket?.send(JSON.stringify({ event: "auth", data: { token } }));
    };
    socket.onmessage = (message) => {
      const envelope = JSON.parse(String(message.data)) as { event: string; data: unknown };
      if (envelope.event === "authenticated") {
        authenticated = true;
        attempt = 0;
        socket?.send(JSON.stringify({ event: "driver.subscribe", data: {} }));
        if (rideId) socket?.send(JSON.stringify({ event: "ride.subscribe", data: { rideId } }));
        handlers.onStateChange?.("live");
      }
      // Konum onayları UI state'ini kirletmesin.
      if (envelope.event !== "driver.location.ack") handlers.onEvent(envelope.event, envelope.data);
    };
    socket.onclose = () => {
      authenticated = false;
      handlers.onStateChange?.("offline");
      socket = null;
      if (closed) return;
      attempt += 1;
      retryTimer = window.setTimeout(open, Math.min(1_000 * 2 ** (attempt - 1), MAX_RETRY_MS));
    };
  };
  open();

  const live = () => socket?.readyState === WebSocket.OPEN && authenticated;

  return {
    subscribeRide(next) {
      rideId = next;
      if (live() && next) socket?.send(JSON.stringify({ event: "ride.subscribe", data: { rideId: next } }));
    },
    sendLocation(ping) {
      if (!live()) return false;
      socket?.send(JSON.stringify({ event: "driver.location", data: ping }));
      return true;
    },
    isLive: () => Boolean(live()),
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
