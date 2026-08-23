import { createRideSchema, driverCancelReasons, passengerCancelReasons, rideStatusSchema } from "@heytaksi/shared";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import { validate } from "../../core/http/validation.js";
import { RideService } from "./ride.service.js";
const params = z.object({ rideId: z.uuid() });
const cancel = z.object({
  reason: z.enum([...passengerCancelReasons, ...driverCancelReasons]),
  note: z.string().max(500).optional(),
});
const reject = z.object({ reason: z.enum(driverCancelReasons).optional() });
const status = z.object({ status: rideStatusSchema });
const message = z.object({ body: z.string().trim().min(1).max(500) });
const rating = z.object({ stars: z.number().int().min(1).max(5), comment: z.string().max(500).optional() });
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
  app.post('/:rideId/accept', { preHandler: app.requireRoles('driver') }, async (request) => {
    const id = validate(params, request.params).rideId;
    return { success: true, data: await service.accept(id, request.user.id) };
  });
  app.post('/:rideId/reject', { preHandler: app.requireRoles('driver') }, async (request) => {
    const id = validate(params, request.params).rideId;
    const input = validate(reject, request.body ?? {});
    return { success: true, data: await service.reject(id, request.user.id, input?.reason) };
  });
  app.get('/:rideId/messages', { preHandler: app.authenticate }, async (request) => {
    const id = validate(params, request.params).rideId;
    return { success: true, data: await service.messages(id, request.user.id) };
  });
  app.post('/:rideId/messages', { preHandler: app.authenticate }, async (request, reply) => {
    const id = validate(params, request.params).rideId;
    return reply.status(201).send({ success: true, data: await service.sendMessage(id, request.user.id, validate(message, request.body).body) });
  });
  app.post('/:rideId/rating', { preHandler: app.authenticate }, async (request) => {
    const id = validate(params, request.params).rideId;
    const input = validate(rating, request.body);
    return { success: true, data: await service.rate(id, request.user.id, input.stars, input.comment) };
  });
  app.get('/:rideId/contact', { preHandler: app.authenticate }, async (request) => {
    const id = validate(params, request.params).rideId;
    return { success: true, data: await service.contact(id, request.user.id) };
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
