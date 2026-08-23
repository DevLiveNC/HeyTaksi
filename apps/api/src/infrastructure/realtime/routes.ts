import type { FastifyPluginAsync } from "fastify";
import type { RealtimeEnvelope, UserIdentity } from "@heytaksi/shared";
const envelope = (event: string, data: unknown): RealtimeEnvelope => ({
  event,
  data,
  timestamp: new Date().toISOString(),
});
export const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { websocket: true }, (socket) => {
    let identity: (UserIdentity & { tokenType: string }) | null = null;
    socket.send(
      JSON.stringify(envelope("connection.ready", { authenticated: false })),
    );
    socket.on("message", async (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as {
          event?: string;
          data?: Record<string, string>;
        };
        if (message.event === "ping") {
          socket.send(JSON.stringify(envelope("pong", message.data ?? null)));
          return;
        }
        if (message.event === "auth") {
          try {
            const token = message.data?.token;
            if (!token) throw new Error();
            identity = app.jwt.verify(token) as typeof identity;
            if (identity?.tokenType !== "access") throw new Error();
            socket.send(
              JSON.stringify(
                envelope("authenticated", { userId: identity.id }),
              ),
            );
          } catch {
            socket.send(
              JSON.stringify(envelope("error", { code: "UNAUTHORIZED" })),
            );
            socket.close(1008, "Unauthorized");
          }
          return;
        }
        if (!identity) {
          socket.send(
            JSON.stringify(envelope("error", { code: "AUTH_REQUIRED" })),
          );
          return;
        }
        if (message.event === "ride.subscribe") {
          const rideId = message.data?.rideId;
          if (!rideId) {
            socket.send(
              JSON.stringify(envelope("error", { code: "INVALID_RIDE" })),
            );
            return;
          }
          const allowed = await app.db.query(
            "SELECT 1 FROM rides r LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.id=$1 AND (r.passenger_id=$2 OR d.user_id=$2)",
            [rideId, identity.id],
          );
          if (!allowed.rowCount) {
            socket.send(
              JSON.stringify(envelope("error", { code: "FORBIDDEN" })),
            );
            return;
          }
          app.realtime.subscribe(rideId, socket);
          socket.send(JSON.stringify(envelope("ride.subscribed", { rideId })));
          return;
        }
        if (message.event === "driver.subscribe") {
          if (identity.role !== "driver") {
            socket.send(JSON.stringify(envelope("error", { code: "FORBIDDEN" })));
            return;
          }
          app.realtime.subscribeUser(identity.id, socket);
          socket.send(JSON.stringify(envelope("driver.subscribed", { userId: identity.id })));
          return;
        }
        socket.send(
          JSON.stringify(envelope("error", { code: "UNKNOWN_EVENT" })),
        );
      } catch {
        socket.send(
          JSON.stringify(envelope("error", { code: "INVALID_MESSAGE" })),
        );
      }
    });
  });
};
