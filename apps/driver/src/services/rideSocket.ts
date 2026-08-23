/** Sürücü realtime bağlantısı: auth → driver.subscribe (+ aktif yolculuk kanalı) ve otomatik yeniden bağlanma. */
export interface SocketHandlers {
  onStateChange?: (state: "connecting" | "live" | "offline") => void;
  onEvent: (event: string, data: unknown) => void;
}

export interface DriverSocket {
  subscribeRide(rideId: string | null): void;
  close(): void;
}

export function createDriverSocket(
  url: string,
  getToken: () => string | null,
  handlers: SocketHandlers,
): DriverSocket {
  let socket: WebSocket | null = null;
  let closed = false;
  let rideId: string | null = null;
  let retryTimer: number | undefined;

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
        socket?.send(JSON.stringify({ event: "driver.subscribe", data: {} }));
        if (rideId)
          socket?.send(JSON.stringify({ event: "ride.subscribe", data: { rideId } }));
        handlers.onStateChange?.("live");
      }
      handlers.onEvent(envelope.event, envelope.data);
    };
    socket.onclose = () => {
      handlers.onStateChange?.("offline");
      socket = null;
      if (!closed) retryTimer = window.setTimeout(open, 4000);
    };
  };
  open();
  return {
    subscribeRide(next) {
      rideId = next;
      if (socket?.readyState === WebSocket.OPEN && next)
        socket.send(JSON.stringify({ event: "ride.subscribe", data: { rideId: next } }));
    },
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
