import type { FastifyPluginAsync } from 'fastify';

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', { preHandler: app.requireRoles('admin', 'dispatcher', 'support') }, async () => ({
    success: true,
    data: { status: 'foundation-ready', metrics: null },
  }));
};
