import { paymentMethodCreateSchema, walletTopupSchema } from '@heytaksi/shared';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { PaymentService } from './index.js';

const methodParams = z.object({ methodId: z.uuid() });

export const paymentRoutes: FastifyPluginAsync = async (app) => {
  const payments = new PaymentService(app.db);
  app.get('/wallet', { preHandler: app.authenticate }, async (request) => ({
    success: true,
    data: await payments.getWallet(request.user.id),
  }));
  app.post('/wallet/topup', { preHandler: app.requirePermissions('payments:update') }, async (request) => ({
    success: true,
    data: await payments.topup(request.user.id, validate(walletTopupSchema, request.body)),
  }));
  app.get('/methods', { preHandler: app.authenticate }, async (request) => {
    const wallet = await payments.getWallet(request.user.id);
    return { success: true, data: wallet.methods };
  });
  app.post('/methods', { preHandler: app.requirePermissions('payments:update') }, async (request, reply) =>
    reply.status(201).send({
      success: true,
      data: await payments.addMethod(request.user.id, validate(paymentMethodCreateSchema, request.body)),
    }),
  );
  app.delete('/methods/:methodId', { preHandler: app.requirePermissions('payments:update') }, async (request, reply) => {
    await payments.deleteMethod(request.user.id, validate(methodParams, request.params).methodId);
    return reply.status(204).send();
  });
};
