import { adminPageSchema, supportTicketStatusSchema } from '@heytaksi/shared';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AppError } from '../../core/errors/app-error.js';

const driverParams = z.object({ driverId: z.uuid() });
const verificationSchema = z.object({ status: z.enum(['pending','verified','rejected']) });
const vehicleParams = z.object({ vehicleId: z.uuid() });
const vehicleStatusSchema = z.object({ status: z.enum(['pending','active','rejected','suspended']) });
const ticketParams = z.object({ ticketId: z.uuid() });
const ticketStatusBody = z.object({ status: supportTicketStatusSchema });

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', { preHandler: app.requirePermissions('admin:access') }, async () => {
    const result = await app.db.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE status='active') AS users,
      (SELECT COUNT(*)::int FROM drivers) AS drivers,
      (SELECT COUNT(*)::int FROM rides WHERE created_at > NOW() - INTERVAL '24 hours') AS ridesToday,
      (SELECT COUNT(*)::int FROM support_tickets WHERE status IN ('open','in_progress')) AS openTickets,
      (SELECT COUNT(*)::int FROM user_sessions WHERE revoked_at IS NULL AND expires_at>NOW()) AS sessions`);
    return { success: true, data: result.rows[0] };
  });

  app.get('/users', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT u.id,u.email,u.phone,u.first_name AS "firstName",u.last_name AS "lastName",r.name AS role,
        u.status,u.created_at AS "createdAt" FROM users u JOIN roles r ON r.id=u.role
        WHERE ($3::text IS NULL OR u.email ILIKE $3 OR u.first_name ILIKE $3 OR u.last_name ILIKE $3)
        ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM users u
        WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)`, [like]),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/passengers', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT u.id,u.email,u.phone,u.first_name AS "firstName",u.last_name AS "lastName",u.status,
        u.created_at AS "createdAt", COALESCE(w.balance,0)::float8 AS "walletBalance",
        (SELECT COUNT(*)::int FROM rides r WHERE r.passenger_id=u.id) AS "rideCount"
        FROM users u JOIN roles ro ON ro.id=u.role LEFT JOIN wallets w ON w.user_id=u.id
        WHERE ro.name='passenger' AND ($3::text IS NULL OR u.email ILIKE $3 OR u.first_name ILIKE $3 OR u.last_name ILIKE $3)
        ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM users u JOIN roles ro ON ro.id=u.role
        WHERE ro.name='passenger' AND ($1::text IS NULL OR u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)`, [like]),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/drivers', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT d.id, u.id AS "userId", u.email, u.first_name AS "firstName", u.last_name AS "lastName",
        d.driver_status AS "driverStatus", d.verification_status AS "verificationStatus", d.availability,
        d.rating::float8 AS rating, d.total_rides AS "totalRides", d.acceptance_rate::float8 AS "acceptanceRate",
        v.plate, v.brand||' '||v.model AS vehicle
        FROM drivers d JOIN users u ON u.id=d.user_id
        LEFT JOIN LATERAL (SELECT plate, brand, model FROM vehicles WHERE driver_id=d.id AND status='active' ORDER BY created_at DESC LIMIT 1) v ON TRUE
        WHERE ($3::text IS NULL OR u.email ILIKE $3 OR u.first_name ILIKE $3 OR u.last_name ILIKE $3 OR v.plate ILIKE $3)
        ORDER BY d.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM drivers', []),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/vehicles', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT v.id, v.plate, v.brand, v.model, v.year, v.color, v.vehicle_type AS "vehicleType", v.status,
        (u.first_name||' '||u.last_name) AS "driverName", u.email AS "driverEmail"
        FROM vehicles v JOIN drivers d ON d.id=v.driver_id JOIN users u ON u.id=d.user_id
        WHERE ($3::text IS NULL OR v.plate ILIKE $3 OR v.brand ILIKE $3 OR u.email ILIKE $3)
        ORDER BY v.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM vehicles', []),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/rides', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT r.id, r.status, r.vehicle_type AS "vehicleType", r.pickup_address AS "pickupAddress",
        r.destination_address AS "destinationAddress", r.created_at AS "createdAt",
        p.estimated_fare::float8 AS "estimatedFare", p.final_fare::float8 AS "finalFare",
        (pu.first_name||' '||pu.last_name) AS "passengerName",
        (du.first_name||' '||du.last_name) AS "driverName"
        FROM rides r JOIN ride_pricing p ON p.ride_id=r.id
        LEFT JOIN users pu ON pu.id=r.passenger_id
        LEFT JOIN drivers d ON d.id=r.driver_id LEFT JOIN users du ON du.id=d.user_id
        WHERE ($3::text IS NULL OR r.pickup_address ILIKE $3 OR r.destination_address ILIKE $3 OR pu.email ILIKE $3)
        ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM rides', []),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/support', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit, q } = validate(adminPageSchema, request.query);
    const like = q ? `%${q}%` : null;
    const [items, count] = await Promise.all([
      app.db.query(`SELECT t.id, t.user_id AS "userId", u.email AS "userEmail",
        (u.first_name||' '||u.last_name) AS "userName", t.ride_id AS "rideId", t.subject, t.message, t.status,
        t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM support_tickets t JOIN users u ON u.id=t.user_id
        WHERE ($3::text IS NULL OR t.subject ILIKE $3 OR t.message ILIKE $3 OR u.email ILIKE $3)
        ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit, like]),
      app.db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM support_tickets', []),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });
  app.patch('/support/:ticketId', { preHandler: app.requirePermissions('support:manage') }, async (request) => {
    const { ticketId } = validate(ticketParams, request.params);
    const { status } = validate(ticketStatusBody, request.body);
    const result = await app.db.query(
      `UPDATE support_tickets SET status=$2, updated_at=NOW() WHERE id=$1
       RETURNING id, user_id AS "userId", ride_id AS "rideId", subject, message, status,
       created_at AS "createdAt", updated_at AS "updatedAt"`,
      [ticketId, status],
    );
    if (!result.rows[0]) throw new AppError(404, 'TICKET_NOT_FOUND', 'Destek kaydı bulunamadı.');
    return { success: true, data: result.rows[0] };
  });

  app.patch('/drivers/:driverId/verification', { preHandler: app.requirePermissions('drivers:verify') }, async (request) => {
    const { driverId } = validate(driverParams, request.params);
    const { status } = validate(verificationSchema, request.body);
    const result = await app.db.query(`UPDATE drivers SET verification_status=$2,driver_status=CASE WHEN $2='verified' THEN 'active' ELSE driver_status END,updated_at=NOW() WHERE id=$1 RETURNING id,verification_status AS "verificationStatus",driver_status AS "driverStatus"`, [driverId, status]);
    return { success: true, data: result.rows[0] };
  });
  app.patch('/vehicles/:vehicleId/status', { preHandler: app.requirePermissions('drivers:verify') }, async (request) => {
    const { vehicleId } = validate(vehicleParams, request.params);
    const { status } = validate(vehicleStatusSchema, request.body);
    const result = await app.db.query('UPDATE vehicles SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id,status', [vehicleId, status]);
    return { success: true, data: result.rows[0] };
  });

  app.get('/audit-logs', { preHandler: app.requirePermissions('audit:read') }, async (request) => {
    const { page, limit } = validate(adminPageSchema, request.query);
    const result = await app.db.query(
      `SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",a.ip_address AS "ipAddress",
       a.metadata,a.created_at AS "createdAt",u.email AS "actorEmail"
       FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, (page-1)*limit],
    );
    return { success: true, data: result.rows, meta: { page, limit } };
  });
};
