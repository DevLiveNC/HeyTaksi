import { driverAvailabilityTargetSchema, locationPingSchema } from '@heytaksi/shared';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';
import { AppError } from '../../core/errors/app-error.js';
import { DriverService, earningsPeriods, type EarningsPeriod } from './driver.service.js';
import { RideService } from '../rides/ride.service.js';

const vehicleSchema = z.object({
  plate: z.string().trim().min(5).max(20).transform((value) => value.replace(/\s/g, '').toUpperCase()),
  brand: z.string().trim().min(2).max(60), model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1), color: z.string().trim().min(2).max(40),
  vehicleType: z.enum(['standard', 'comfort', 'xl', 'accessible']),
});
const availabilitySchema = z.object({ availability: driverAvailabilityTargetSchema });
const documentSchema = z.object({
  documentType: z.enum(['driver_license', 'identity', 'criminal_record', 'vehicle_registration', 'insurance']),
  documentUrl: z.url(), expiryDate: z.iso.date().nullable().optional(),
});
const earningsQuery = z.object({ period: z.enum(['day', 'week', 'month']).default('day') });

export const driverRoutes: FastifyPluginAsync = async (app) => {
  const driverGuard = app.requireRoles('driver');
  const drivers = new DriverService(app);
  const rides = new RideService(app);
  app.get('/me', { preHandler: driverGuard }, async (request) => {
    const result = await app.db.query(
      `SELECT d.id,d.driver_status AS "driverStatus",d.rating,d.total_rides AS "totalRides",
       d.acceptance_rate AS "acceptanceRate",d.cancellation_rate AS "cancellationRate",
       d.online_status AS "onlineStatus",d.verification_status AS "verificationStatus",d.availability
       FROM drivers d WHERE d.user_id=$1`, [request.user.id],
    );
    if (!result.rows[0]) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Sürücü profili bulunamadı.');
    return { success: true, data: result.rows[0] };
  });
  app.get('/me/dashboard', { preHandler: driverGuard }, async (request) => ({
    success: true,
    data: await drivers.dashboard(request.user.id),
  }));
  app.patch('/me/availability', { preHandler: driverGuard }, async (request) => {
    const input = validate(availabilitySchema, request.body);
    return { success: true, data: await drivers.setAvailability(request.user.id, input.availability) };
  });
  // Faz 2 uyumluluğu: boolean çevrim içi anahtarı durum makinesine çevrilir.
  app.patch('/me/online', { preHandler: driverGuard }, async (request) => {
    const { online } = validate(z.object({ online: z.boolean() }), request.body);
    return {
      success: true,
      data: await drivers.setAvailability(request.user.id, online ? 'online' : 'offline'),
    };
  });
  app.post('/me/location', { preHandler: driverGuard }, async (request, reply) => {
    const input = validate(locationPingSchema, request.body);
    return reply.status(201).send({ success: true, data: await drivers.updateLocation(request.user.id, input) });
  });
  app.get('/me/hotspots', { preHandler: driverGuard }, async () => ({
    success: true,
    data: await drivers.hotspots(),
  }));
  app.get('/me/earnings', { preHandler: driverGuard }, async (request) => {
    const period = validate(earningsQuery, request.query).period as EarningsPeriod;
    if (!earningsPeriods.includes(period)) throw new AppError(422, 'INVALID_PERIOD', 'Geçersiz kazanç dönemi.');
    return { success: true, data: await drivers.earnings(request.user.id, period) };
  });
  app.get('/me/rides/current', { preHandler: driverGuard }, async (request) => ({
    success: true,
    data: await rides.driverActiveRide(request.user.id),
  }));
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
