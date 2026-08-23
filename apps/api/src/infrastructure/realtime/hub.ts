import fp from "fastify-plugin";
import type { RealtimeEnvelope } from "@heytaksi/shared";
import type { WebSocket } from "ws";
export class RealtimeHub {
  private readonly rides = new Map<string, Set<WebSocket>>();
  subscribe(rideId: string, socket: WebSocket) {
    const clients = this.rides.get(rideId) ?? new Set<WebSocket>();
    clients.add(socket);
    this.rides.set(rideId, clients);
    socket.once("close", () => {
      clients.delete(socket);
      if (!clients.size) this.rides.delete(rideId);
    });
  }
  publishRide(rideId: string, data: unknown) {
    const message: RealtimeEnvelope = {
      event: "ride.updated",
      data,
      timestamp: new Date().toISOString(),
    };
    for (const socket of this.rides.get(rideId) ?? []) {
      if (socket.readyState === socket.OPEN)
        socket.send(JSON.stringify(message));
    }
  }
}
export const realtimeHubPlugin = fp(
  async (app) => {
    app.decorate("realtime", new RealtimeHub());
  },
  { name: "realtime-hub" },
);
