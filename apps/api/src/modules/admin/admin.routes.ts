import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';

const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', { preHandler: app.requirePermissions('admin:access') }, async () => {
    const result = await app.db.query(`SELECT
      (SELECT COUNT(*)::int FROM users WHERE status='active') AS users,
      (SELECT COUNT(*)::int FROM drivers) AS drivers,
      (SELECT COUNT(*)::int FROM user_sessions WHERE revoked_at IS NULL AND expires_at>NOW()) AS sessions`);
    return { success: true, data: result.rows[0] };
  });

  app.get('/users', { preHandler: app.requirePermissions('users:read') }, async (request) => {
    const { page, limit } = validate(pageSchema, request.query);
    const [items, count] = await Promise.all([
      app.db.query(`SELECT u.id,u.email,u.phone,u.first_name AS "firstName",u.last_name AS "lastName",r.name AS role,
        u.status,u.created_at AS "createdAt" FROM users u JOIN roles r ON r.id=u.role ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, [limit, (page-1)*limit]),
      app.db.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM users'),
    ]);
    return { success: true, data: items.rows, meta: { page, limit, total: count.rows[0]?.total ?? 0 } };
  });

  app.get('/audit-logs', { preHandler: app.requirePermissions('audit:read') }, async (request) => {
    const { page, limit } = validate(pageSchema, request.query);
    const result = await app.db.query(
      `SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",a.ip_address AS "ipAddress",
       a.metadata,a.created_at AS "createdAt",u.email AS "actorEmail"
       FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, (page-1)*limit],
    );
    return { success: true, data: result.rows, meta: { page, limit } };
  });
};
