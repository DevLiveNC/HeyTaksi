import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AppError } from '../../core/errors/app-error.js';

const vehicleSchema = z.object({
  plate: z.string().trim().min(5).max(20).transform((value) => value.replace(/\s/g, '').toUpperCase()),
  brand: z.string().trim().min(2).max(60), model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1), color: z.string().trim().min(2).max(40),
  vehicleType: z.enum(['standard', 'comfort', 'xl', 'accessible']),
});
const documentSchema = z.object({
  documentType: z.enum(['driver_license', 'identity', 'criminal_record', 'vehicle_registration', 'insurance']),
  documentUrl: z.url(), expiryDate: z.iso.date().nullable().optional(),
});

export const driverRoutes: FastifyPluginAsync = async (app) => {
  const driverGuard = app.requireRoles('driver');
  app.get('/me', { preHandler: driverGuard }, async (request) => {
    const result = await app.db.query(
      `SELECT d.id,d.driver_status AS "driverStatus",d.rating,d.total_rides AS "totalRides",
       d.acceptance_rate AS "acceptanceRate",d.cancellation_rate AS "cancellationRate",
       d.online_status AS "onlineStatus",d.verification_status AS "verificationStatus"
       FROM drivers d WHERE d.user_id=$1`, [request.user.id],
    );
    if (!result.rows[0]) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Sürücü profili bulunamadı.');
    return { success: true, data: result.rows[0] };
  });
  app.post('/me/vehicles', { preHandler: driverGuard }, async (request, reply) => {
    const input = validate(vehicleSchema, request.body);
    const result = await app.db.query(
      `INSERT INTO vehicles(driver_id,plate,brand,model,year,color,vehicle_type)
       SELECT id,$2,$3,$4,$5,$6,$7 FROM drivers WHERE user_id=$1 RETURNING *`,
      [request.user.id,input.plate,input.brand,input.model,input.year,input.color,input.vehicleType],
    );
    return reply.status(201).send({ success: true, data: result.rows[0] });
  });
  app.post('/me/documents', { preHandler: driverGuard }, async (request, reply) => {
    const input = validate(documentSchema, request.body);
    const result = await app.db.query(
      `INSERT INTO driver_documents(driver_id,document_type,document_url,expiry_date)
       SELECT id,$2,$3,$4 FROM drivers WHERE user_id=$1
       ON CONFLICT(driver_id,document_type) DO UPDATE SET document_url=EXCLUDED.document_url,expiry_date=EXCLUDED.expiry_date,
       verification_status='pending',updated_at=NOW() RETURNING *`,
      [request.user.id,input.documentType,input.documentUrl,input.expiryDate ?? null],
    );
    return reply.status(201).send({ success: true, data: result.rows[0] });
  });
};
