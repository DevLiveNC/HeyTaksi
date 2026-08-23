import { loginSchema, otpRequestSchema, otpVerifySchema, registerSchema } from '@heytaksi/shared';
import { z } from 'zod';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AppError } from '../../core/errors/app-error.js';
import { AuthService } from './auth.service.js';

const refreshSchema = z.object({ refreshToken: z.string().min(20) });
const logoutSchema = z.object({ allDevices: z.boolean().default(false) });
const sessionParams = z.object({ sessionId: z.uuid() });
const contextOf = (request: FastifyRequest) => ({ ip: request.ip, userAgent: request.headers['user-agent'] ?? 'unknown' });

export const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app);
  app.post('/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) =>
    reply.status(201).send({ success: true, data: await service.register(validate(registerSchema, request.body), contextOf(request)) }));
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) =>
    ({ success: true, data: await service.login(validate(loginSchema, request.body), contextOf(request)) }));
  app.post('/otp/request', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request) =>
    ({ success: true, data: await service.requestOtp(validate(otpRequestSchema, request.body), contextOf(request)) }));
  app.post('/otp/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request) =>
    ({ success: true, data: await service.verifyOtp(validate(otpVerifySchema, request.body), contextOf(request)) }));
  app.post('/refresh', async (request) => {
    const input = validate(refreshSchema, request.body);
    return { success: true, data: await service.refresh(input.refreshToken, contextOf(request)) };
  });
  app.post('/logout', { preHandler: app.authenticate }, async (request, reply) => {
    const input = validate(logoutSchema, request.body ?? {});
    await service.logout(request.user.id, request.user.sid, contextOf(request), input.allDevices);
    return reply.status(204).send();
  });
  app.get('/me', { preHandler: app.authenticate }, async (request) => ({ success: true, data: request.user }));
  app.get('/sessions', { preHandler: app.authenticate }, async (request) => ({ success: true, data: await service.listSessions(request.user.id) }));
  app.delete('/sessions/:sessionId', { preHandler: app.authenticate }, async (request, reply) => {
    const { sessionId } = validate(sessionParams, request.params);
    if (sessionId === request.user.sid) throw new AppError(400, 'CURRENT_SESSION', 'Aktif oturum için logout endpointini kullanın.');
    if (!(await service.revokeSession(request.user.id, sessionId))) throw new AppError(404, 'SESSION_NOT_FOUND', 'Oturum bulunamadı.');
    return reply.status(204).send();
  });
};
