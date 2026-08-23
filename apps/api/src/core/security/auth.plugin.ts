import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { Role } from '@heytaksi/shared';
import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';

export const authPlugin = fp(async (app) => {
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
      if (request.user.tokenType !== 'access') throw AppError.unauthorized();
    } catch { throw AppError.unauthorized('Oturum geçersiz veya süresi dolmuş.'); }
  });
  app.decorate('requireRoles', (...roles: Role[]) => async (request) => {
    await app.authenticate(request, {} as never);
    if (!roles.includes(request.user.role)) throw AppError.forbidden();
  });
  app.decorate('requirePermissions', (...permissions: string[]) => async (request) => {
    await app.authenticate(request, {} as never);
    if (!permissions.every((permission) => request.user.permissions.includes(permission))) throw AppError.forbidden();
  });
}, { name: 'auth', dependencies: ['database'] });
