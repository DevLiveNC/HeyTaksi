import fp from "fastify-plugin";
import type { RealtimeEnvelope } from "@heytaksi/shared";
import type { WebSocket } from "ws";

type EnvelopeEvent = RealtimeEnvelope["event"];

export class RealtimeHub {
  private readonly rides = new Map<string, Set<WebSocket>>();
  private readonly users = new Map<string, Set<WebSocket>>();

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

  /** Sürücü kanalı: teklif ve durum güncellemeleri kullanıcı bazlı iletilir. */
  subscribeUser(userId: string, socket: WebSocket) {
    const clients = this.users.get(userId) ?? new Set<WebSocket>();
    this.bind(clients, socket);
    this.users.set(userId, clients);
    socket.once("close", () => {
      if (!clients.size) this.users.delete(userId);
    });
  }

  private send(sockets: Set<WebSocket> | undefined, event: EnvelopeEvent, data: unknown) {
    const message: RealtimeEnvelope = { event, data, timestamp: new Date().toISOString() };
    for (const socket of sockets ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    }
  }

  publishRide(rideId: string, data: unknown) {
    this.send(this.rides.get(rideId), "ride.updated", data);
  }

  publishRideMessage(rideId: string, data: unknown) {
    this.send(this.rides.get(rideId), "ride.message", data);
  }

  publishUser(userId: string, event: EnvelopeEvent, data: unknown) {
    this.send(this.users.get(userId), event, data);
  }
}
export const realtimeHubPlugin = fp(
  async (app) => {
    app.decorate("realtime", new RealtimeHub());
  },
  { name: "realtime-hub" },
);
