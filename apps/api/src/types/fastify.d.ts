import type { Role, UserIdentity } from '@heytaksi/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    redis: Redis;
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
