import { supportTicketCreateSchema } from '@heytaksi/shared';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';

export const supportModule = { name: 'support', status: 'active' } as const;

export const supportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tickets', { preHandler: app.authenticate }, async (request) => {
    const result = await app.db.query(
      `SELECT t.id, t.user_id AS "userId", u.email AS "userEmail",
       (u.first_name||' '||u.last_name) AS "userName", t.ride_id AS "rideId", t.subject, t.message, t.status,
       t.created_at AS "createdAt", t.updated_at AS "updatedAt"
       FROM support_tickets t JOIN users u ON u.id=t.user_id
       WHERE t.user_id=$1 ORDER BY t.created_at DESC LIMIT 50`,
      [request.user.id],
    );
    return { success: true, data: result.rows };
  });
  app.post('/tickets', { preHandler: app.authenticate }, async (request, reply) => {
    const input = validate(supportTicketCreateSchema, request.body);
    const result = await app.db.query(
      `INSERT INTO support_tickets(user_id, ride_id, subject, message)
       VALUES ($1,$2,$3,$4)
       RETURNING id, user_id AS "userId", ride_id AS "rideId", subject, message, status,
       created_at AS "createdAt", updated_at AS "updatedAt"`,
      [request.user.id, input.rideId ?? null, input.subject, input.message],
    );
    return reply.status(201).send({ success: true, data: result.rows[0] });
  });
};
