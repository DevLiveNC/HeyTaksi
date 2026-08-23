import { profileUpdateSchema } from '@heytaksi/shared';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AppError } from '../../core/errors/app-error.js';
import { AuthRepository } from '../auth/auth.repository.js';

export const userRoutes: FastifyPluginAsync = async (app) => {
  const authRepository = new AuthRepository(app.db);
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const user = await authRepository.findById(request.user.id);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı.');
    return { success: true, data: {
      id: user.id, email: user.email, phone: user.phone, firstName: user.first_name, lastName: user.last_name,
      profileImage: user.profile_image, role: user.role, permissions: user.permissions, status: user.status,
      createdAt: user.created_at.toISOString(), updatedAt: user.updated_at.toISOString(),
    } };
  });

  app.patch('/me', { preHandler: app.requirePermissions('profile:update') }, async (request) => {
    const input = validate(profileUpdateSchema, request.body);
    await app.db.query(
      `UPDATE users SET first_name=COALESCE($2,first_name), last_name=COALESCE($3,last_name),
       profile_image=CASE WHEN $4::boolean THEN $5 ELSE profile_image END, updated_at=NOW() WHERE id=$1`,
      [request.user.id, input.firstName ?? null, input.lastName ?? null, 'profileImage' in input, input.profileImage ?? null],
    );
    await authRepository.audit({ actorId: request.user.id, action: 'profile.update', entityType: 'user', entityId: request.user.id,
      context: { ip: request.ip, userAgent: request.headers['user-agent'] ?? 'unknown' }, metadata: { fields: Object.keys(input) } });
    const updated = await authRepository.findById(request.user.id);
    return { success: true, data: { firstName: updated!.first_name, lastName: updated!.last_name, profileImage: updated!.profile_image } };
  });

  app.get('/me/devices', { preHandler: app.authenticate }, async (request) => {
    const result = await app.db.query(
      `SELECT id,name,platform,last_ip AS "lastIp",last_seen_at AS "lastSeenAt",trusted_at AS "trustedAt",created_at AS "createdAt"
       FROM devices WHERE user_id=$1 ORDER BY last_seen_at DESC`, [request.user.id],
    );
    return { success: true, data: result.rows };
  });
};
