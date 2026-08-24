import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { validate } from '../../core/http/validation.js';

const rideParams = z.object({ rideId: z.uuid() });
const nearbyQuery = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(200).max(25_000).default(5_000),
});

/** Operasyon ve tanılama uçları: canlı harita, dağıtım durumu ve aday sıralaması. */
export const dispatchRoutes: FastifyPluginAsync = async (app) => {
  const monitor = app.requirePermissions('dispatch:monitor');
  const manage = app.requirePermissions('dispatch:manage');

  // Canlı sürücü haritası anlık görüntüsü; WebSocket akışının ilk yüklemesi.
  app.get('/live', { preHandler: monitor }, async () => ({
    success: true,
    data: await app.locationService.overview(),
  }));

  // Yolcuya gösterilen anonim yakın sürücüler.
  app.get('/nearby', { preHandler: app.authenticate }, async (request) => {
    const query = validate(nearbyQuery, request.query);
    return {
      success: true,
      data: await app.locationService.nearbyForPassenger(
        { latitude: query.latitude, longitude: query.longitude },
        query.radiusMeters,
      ),
    };
  });

  app.get('/rides/:rideId', { preHandler: monitor }, async (request) => {
    const { rideId } = validate(rideParams, request.params);
    const [status, offers] = await Promise.all([app.dispatch.status(rideId), app.dispatch.offers(rideId)]);
    return { success: true, data: { ...status, offers } };
  });

  // Sıralama şeffaflığı: skor bileşenleriyle birlikte aday listesi.
  app.get('/rides/:rideId/candidates', { preHandler: monitor }, async (request) => {
    const { rideId } = validate(rideParams, request.params);
    return { success: true, data: await app.dispatch.candidates(rideId) };
  });

  // Sonuçsuz kapanan aramayı operasyon ekibi yeniden başlatabilir.
  app.post('/rides/:rideId/restart', { preHandler: manage }, async (request) => {
    const { rideId } = validate(rideParams, request.params);
    await app.dispatch.cancel(rideId, 'dispatch_restart');
    return { success: true, data: await app.dispatch.start(rideId) };
  });
};
