import { loginSchema, registerSchema } from '@heytaksi/shared';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AuthService } from './auth.service.js';

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app);
  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) =>
    reply.status(201).send({ success: true, data: await service.register(validate(registerSchema, request.body)) }));
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) =>
    ({ success: true, data: await service.login(validate(loginSchema, request.body)) }));
  app.post('/refresh', async (request) => {
    const input = validate(refreshSchema, request.body);
    return { success: true, data: await service.refresh(input.refreshToken) };
  });
  app.get('/me', { preHandler: app.authenticate }, async (request) => ({ success: true, data: request.user }));
};
