import { AppError } from '../errors/app-error.js';
import type { FastifyInstance } from 'fastify';

export function registerErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) => reply.status(404).send({
    success: false,
    error: { code: 'NOT_FOUND', message: 'İstenen kaynak bulunamadı.', requestId: request.id },
  }));

  app.setErrorHandler((error: unknown, request, reply) => {
    const known = error instanceof AppError;
    const genericError = error instanceof Error ? error : new Error('Unknown error');
    const providedStatus = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : undefined;
    const statusCode = known ? error.statusCode : (providedStatus && providedStatus < 500 ? providedStatus : 500);
    if (statusCode >= 500) request.log.error({ err: genericError }, 'İstek işlenemedi');
    else request.log.warn({ err: genericError }, 'İstek reddedildi');
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: known ? error.code : statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: known ? error.message : statusCode === 500 ? 'Beklenmeyen bir hata oluştu.' : genericError.message,
        ...(known && error.details !== undefined ? { details: error.details } : {}),
        requestId: request.id,
      },
    });
  });
}
