import { createRideSchema, rideStatusSchema } from "@heytaksi/shared";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { validate } from "../../core/http/validation.js";
import { RideService } from "./ride.service.js";
const params = z.object({ rideId: z.uuid() });
const cancel = z.object({
  reason: z.enum(["changed_mind", "wait_too_long", "wrong_location", "other"]),
  note: z.string().max(500).optional(),
});
const status = z.object({ status: rideStatusSchema });
const driverLocation = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), heading: z.number().min(0).max(360).optional(), accuracyMeters: z.number().min(0).max(1000).optional() });
export const rideRoutes: FastifyPluginAsync = async (app) => {
  const service = new RideService(app);
  app.post(
    "/",
    { preHandler: app.requireRoles("passenger") },
    async (request, reply) =>
      reply.status(201).send({
        success: true,
        data: await service.create(
          request.user.id,
          validate(createRideSchema, request.body),
        ),
      }),
  );
  app.get(
    "/current",
    { preHandler: app.requireRoles("passenger") },
    async (request) => ({
      success: true,
      data: await service.current(request.user.id),
    }),
  );
  app.get("/:rideId", { preHandler: app.authenticate }, async (request) => ({
    success: true,
    data: await service.get(
      validate(params, request.params).rideId,
      request.user.id,
    ),
  }));
  app.post(
    "/:rideId/match",
    { preHandler: app.requireRoles("passenger") },
    async (request) => ({
      success: true,
      data: await service.match(
        validate(params, request.params).rideId,
        request.user.id,
      ),
    }),
  );
  app.post(
    "/:rideId/cancel",
    { preHandler: app.authenticate },
    async (request) => {
      const id = validate(params, request.params).rideId;
      const input = validate(cancel, request.body);
      return {
        success: true,
        data: await service.cancel(
          id,
          request.user.id,
          input.reason,
          input.note,
        ),
      };
    },
  );
  app.post('/:rideId/location', { preHandler: app.requireRoles('driver') }, async (request) => {
    const id = validate(params, request.params).rideId;
    return { success: true, data: await service.updateDriverLocation(id, request.user.id, validate(driverLocation, request.body)) };
  });
  app.patch(
    "/:rideId/status",
    { preHandler: app.requireRoles("driver") },
    async (request) => {
      const id = validate(params, request.params).rideId;
      return {
        success: true,
        data: await service.updateStatus(
          id,
          request.user.id,
          validate(status, request.body).status,
        ),
      };
    },
  );
};
