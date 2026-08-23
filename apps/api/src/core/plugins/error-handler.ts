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
    const errorRecord = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {};
    const providedStatus = typeof errorRecord.statusCode === 'number' ? errorRecord.statusCode : undefined;
    const databaseConflict = errorRecord.code === '23505';
    const statusCode = known ? error.statusCode : databaseConflict ? 409 : (providedStatus && providedStatus < 500 ? providedStatus : 500);
    if (statusCode >= 500) request.log.error({ err: genericError }, 'İstek işlenemedi');
    else request.log.warn({ err: genericError }, 'İstek reddedildi');
    return reply.status(statusCode).send({
      success: false,
      error: {
        code: known ? error.code : databaseConflict ? 'CONFLICT' : statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR',
        message: known ? error.message : databaseConflict ? 'Bu bilgilerle kayıt zaten mevcut.' : statusCode === 500 ? 'Beklenmeyen bir hata oluştu.' : genericError.message,
        ...(known && error.details !== undefined ? { details: error.details } : {}),
        requestId: request.id,
      },
    });
  });
}
