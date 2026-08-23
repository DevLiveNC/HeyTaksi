import type { Role, UserIdentity } from '@heytaksi/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import type { RealtimeHub } from '../infrastructure/realtime/hub.js';
import type { DriverLocationStore } from '../infrastructure/redis/driver-location.store.js';
import type { LiveLocationService } from '../modules/locations/live-location.service.js';
import type { DispatchService } from '../modules/dispatch/dispatch.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    redis: Redis;
    realtime: RealtimeHub;
    driverLocations: DriverLocationStore;
    locationService: LiveLocationService;
    dispatch: DispatchService;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermissions: (...permissions: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: UserIdentity & { tokenType: 'access' | 'refresh'; sid: string; did: string };
    user: UserIdentity & { tokenType: 'access' | 'refresh'; sid: string; did: string };
  }
}
