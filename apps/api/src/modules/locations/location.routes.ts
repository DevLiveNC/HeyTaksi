import { coordinateSchema } from "@heytaksi/shared";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { validate } from "../../core/http/validation.js";
import { MapService } from "./map.service.js";
const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});
const reverseSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});
const routeSchema = z.object({
  pickup: coordinateSchema,
  destination: coordinateSchema,
});
export const locationRoutes: FastifyPluginAsync = async (app) => {
  const maps = new MapService();
  app.get(
    "/search",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request) => {
      const q = validate(searchSchema, request.query);
      const near =
        q.latitude !== undefined && q.longitude !== undefined
          ? { latitude: q.latitude, longitude: q.longitude }
          : undefined;
      return { success: true, data: await maps.search(q.q, near) };
    },
  );
  app.get("/reverse", { preHandler: app.authenticate }, async (request) => {
    const q = validate(reverseSchema, request.query);
    return { success: true, data: await maps.reverse(q.latitude, q.longitude) };
  });
  app.post("/route", { preHandler: app.authenticate }, async (request) => {
    const input = validate(routeSchema, request.body);
    return {
      success: true,
      data: await maps.route(input.pickup, input.destination),
    };
  });
  app.get("/maps-config", { preHandler: app.authenticate }, async () => ({
    success: true,
    data: maps.clientConfig(),
  }));
};
