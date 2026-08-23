import fp from "fastify-plugin";
import type { RealtimeEnvelope } from "@heytaksi/shared";
import type { WebSocket } from "ws";

type EnvelopeEvent = RealtimeEnvelope["event"];

/**
 * Gerçek zamanlı yayın merkezi.
 *
 * Üç kanal vardır:
 * - `rides`   : bir yolculuğun katılımcıları (yolcu + atanmış sürücü)
 * - `users`   : kullanıcı bazlı özel bildirimler (teklif, durum değişimi)
 * - `dispatch`: operasyon paneli; canlı sürücü konumları ve dağıtım olayları
 */
export class RealtimeHub {
  private readonly rides = new Map<string, Set<WebSocket>>();
  private readonly users = new Map<string, Set<WebSocket>>();
  private readonly dispatch = new Set<WebSocket>();

  private bind(clients: Set<WebSocket>, socket: WebSocket) {
    clients.add(socket);
    socket.once("close", () => {
      clients.delete(socket);
    });
  }

  subscribe(rideId: string, socket: WebSocket) {
    const clients = this.rides.get(rideId) ?? new Set<WebSocket>();
    this.bind(clients, socket);
    this.rides.set(rideId, clients);
    socket.once("close", () => {
      if (!clients.size) this.rides.delete(rideId);
    });
  }

  unsubscribe(rideId: string, socket: WebSocket) {
    const clients = this.rides.get(rideId);
    clients?.delete(socket);
    if (clients && !clients.size) this.rides.delete(rideId);
  }

  /** Sürücü kanalı: teklif ve durum güncellemeleri kullanıcı bazlı iletilir. */
  subscribeUser(userId: string, socket: WebSocket) {
    const clients = this.users.get(userId) ?? new Set<WebSocket>();
    this.bind(clients, socket);
    this.users.set(userId, clients);
    socket.once("close", () => {
      if (!clients.size) this.users.delete(userId);
    });
  }

  /** Operasyon kanalı: canlı sürücü haritası ve dağıtım olayları. */
  subscribeDispatch(socket: WebSocket) {
    this.bind(this.dispatch, socket);
  }

  hasDispatchListeners(): boolean {
    return this.dispatch.size > 0;
  }

  private send(sockets: Iterable<WebSocket> | undefined, event: EnvelopeEvent, data: unknown) {
    if (!sockets) return;
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() } satisfies RealtimeEnvelope);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }

  publishRide(rideId: string, data: unknown) {
    this.send(this.rides.get(rideId), "ride.updated", data);
  }

  publishRideEvent(rideId: string, event: EnvelopeEvent, data: unknown) {
    this.send(this.rides.get(rideId), event, data);
  }

  publishRideMessage(rideId: string, data: unknown) {
    this.send(this.rides.get(rideId), "ride.message", data);
  }

  publishUser(userId: string, event: EnvelopeEvent, data: unknown) {
    this.send(this.users.get(userId), event, data);
  }

  publishDispatch(event: EnvelopeEvent, data: unknown) {
    this.send(this.dispatch, event, data);
  }
}
export const realtimeHubPlugin = fp(
  async (app) => {
    app.decorate("realtime", new RealtimeHub());
  },
  { name: "realtime-hub" },
);
