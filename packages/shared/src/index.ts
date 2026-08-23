import { z } from 'zod';

export const roles = ['passenger', 'driver', 'admin', 'dispatcher', 'support'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export interface UserIdentity {
  id: string;
  email: string;
  role: Role;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorPayload {
  success: false;
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorPayload;

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const registerSchema = loginSchema.extend({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  role: z.enum(['passenger', 'driver']).default('passenger'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export const websocketEvents = {
  CONNECTION_READY: 'connection.ready',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
} as const;

export interface RealtimeEnvelope<T = unknown> {
  event: (typeof websocketEvents)[keyof typeof websocketEvents] | string;
  data: T;
  timestamp: string;
}
