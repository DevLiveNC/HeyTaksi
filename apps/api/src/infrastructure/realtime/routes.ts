import type { FastifyPluginAsync } from "fastify";
import { locationPingSchema, type RealtimeEnvelope, type UserIdentity } from "@heytaksi/shared";
import type { WebSocket } from "ws";

const envelope = (event: string, data: unknown): RealtimeEnvelope => ({
  event,
  data,
  timestamp: new Date().toISOString(),
});

/** Bağlantı canlılığı: 30 saniyede bir ping, yanıtsız bağlantı kapatılır. */
const HEARTBEAT_MS = 30_000;

export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { websocket: true }, (socket: WebSocket) => {
    let identity: (UserIdentity & { tokenType: string }) | null = null;
    let alive = true;
    const subscribedRides = new Set<string>();
    const send = (event: string, data: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(envelope(event, data)));
    };

    send("connection.ready", { authenticated: false, heartbeatSeconds: HEARTBEAT_MS / 1000 });

    const heartbeat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, HEARTBEAT_MS);
    socket.on("pong", () => {
      alive = true;
    });
    socket.on("close", () => clearInterval(heartbeat));

    socket.on("message", async (raw: Buffer) => {
      alive = true;
      let message: { event?: string; data?: Record<string, unknown> };
      try {
        message = JSON.parse(raw.toString()) as typeof message;
      } catch {
        send("error", { code: "INVALID_MESSAGE" });
        return;
      }
      try {
        if (message.event === "ping") {
          send("pong", message.data ?? null);
          return;
        }
        if (message.event === "auth") {
          try {
            const token = message.data?.token;
            if (typeof token !== "string" || !token) throw new Error();
            identity = app.jwt.verify(token) as typeof identity;
            if (identity?.tokenType !== "access") throw new Error();
            send("authenticated", { userId: identity.id, role: identity.role });
          } catch {
            send("error", { code: "UNAUTHORIZED" });
            socket.close(1008, "Unauthorized");
          }
          return;
        }
        if (!identity) {
          send("error", { code: "AUTH_REQUIRED" });
          return;
        }

        switch (message.event) {
          case "ride.subscribe": {
            const rideId = message.data?.rideId;
            if (typeof rideId !== "string") {
              send("error", { code: "INVALID_RIDE" });
              return;
            }
            const allowed = await app.db.query(
              "SELECT 1 FROM rides r LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.id=$1 AND (r.passenger_id=$2 OR d.user_id=$2)",
              [rideId, identity.id],
            );
            if (!allowed.rowCount) {
              send("error", { code: "FORBIDDEN" });
              return;
            }
            app.realtime.subscribe(rideId, socket);
            subscribedRides.add(rideId);
            send("ride.subscribed", { rideId });
            return;
          }
          case "ride.unsubscribe": {
            const rideId = message.data?.rideId;
            if (typeof rideId === "string") {
              app.realtime.unsubscribe(rideId, socket);
              subscribedRides.delete(rideId);
            }
            return;
          }
          case "driver.subscribe": {
            if (identity.role !== "driver") {
              send("error", { code: "FORBIDDEN" });
              return;
            }
            app.realtime.subscribeUser(identity.id, socket);
            send("driver.subscribed", { userId: identity.id });
            return;
          }
          case "passenger.subscribe": {
            app.realtime.subscribeUser(identity.id, socket);
            send("passenger.subscribed", { userId: identity.id });
            return;
          }
          case "driver.location": {
            // Sürücü konum sinyali: REST yerine açık soket üzerinden düşük gecikmeyle akar.
            if (identity.role !== "driver") {
              send("error", { code: "FORBIDDEN" });
              return;
            }
            const parsed = locationPingSchema.safeParse(message.data ?? {});
            if (!parsed.success) {
              send("error", { code: "INVALID_LOCATION" });
              return;
            }
            const snapshot = await app.locationService.recordDriverPing(identity.id, parsed.data);
            send("driver.location.ack", { recordedAt: snapshot.recordedAt });
            return;
          }
          case "passenger.location": {
            // Yolcu konumu: buluşma noktası doğruluğu için sürücüye iletilir.
            const parsed = locationPingSchema.safeParse(message.data ?? {});
            if (!parsed.success || !parsed.data.rideId) {
              send("error", { code: "INVALID_LOCATION" });
              return;
            }
            await app.locationService.recordPassengerPing(identity.id, parsed.data.rideId, parsed.data);
            return;
          }
          case "dispatch.subscribe": {
            // Operasyon paneli: yalnızca dispatch:monitor izni olan roller.
            if (!identity.permissions?.includes("dispatch:monitor")) {
              send("error", { code: "FORBIDDEN" });
              return;
            }
            app.realtime.subscribeDispatch(socket);
            send("dispatch.subscribed", { userId: identity.id });
            send("dispatch.drivers", await app.locationService.overview());
            return;
          }
          default:
            send("error", { code: "UNKNOWN_EVENT" });
        }
      } catch (error) {
        app.log.warn({ err: error }, "Realtime mesaj işlenemedi");
        send("error", { code: "INTERNAL_ERROR" });
      }
    });
  });
};
