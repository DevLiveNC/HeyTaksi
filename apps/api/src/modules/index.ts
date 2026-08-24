import type { FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth/auth.routes.js';
import { adminRoutes } from './admin/admin.routes.js';
import { userRoutes, usersModule } from './users/index.js';
import { driverRoutes, driversModule } from './drivers/index.js';
import { vehiclesModule } from './vehicles/index.js';
import { rideRoutes, ridesModule } from './rides/index.js';
import { locationRoutes } from './locations/location.routes.js';
import { paymentsModule } from './payments/index.js';
import { notificationsModule } from './notifications/index.js';
import { dispatchModule, dispatchRoutes } from './dispatch/index.js';
import { supportModule } from './support/index.js';

export const apiModules: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(driverRoutes, { prefix: '/drivers' });
  await app.register(locationRoutes, { prefix: '/locations' });
  await app.register(rideRoutes, { prefix: '/rides' });
  await app.register(dispatchRoutes, { prefix: '/dispatch' });
  await app.register(adminRoutes, { prefix: '/admin' });

  // Faz 2 servis sınırları. İş kuralları eklendikçe her modül kendi repository/service/routes katmanını kullanır.
  const reservedModules = [usersModule, driversModule, vehiclesModule, ridesModule, paymentsModule, notificationsModule, dispatchModule, supportModule];
  for (const domainModule of reservedModules) {
    app.get(`/${domainModule.name}/status`, { preHandler: app.authenticate }, async () => ({
      success: true, data: domainModule,
    }));
  }
};
