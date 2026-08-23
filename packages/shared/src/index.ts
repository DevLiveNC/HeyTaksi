import { z } from 'zod';

export const roles = ['passenger', 'driver', 'admin', 'dispatcher', 'support'] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const userStatuses = ['pending', 'active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof userStatuses)[number];

export interface UserIdentity {
  id: string;
  email: string | null;
  phone: string | null;
  role: Role;
  permissions: string[];
}

export interface UserProfile extends UserIdentity {
  firstName: string;
  lastName: string;
  profileImage: string | null;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
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

const email = z.email().transform((value) => value.toLowerCase());
export const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Telefon numarası ülke koduyla yazılmalıdır.');
export const passwordSchema = z.string().min(10).max(128)
  .regex(/[a-z]/, 'En az bir küçük harf gerekli.')
  .regex(/[A-Z]/, 'En az bir büyük harf gerekli.')
  .regex(/\d/, 'En az bir rakam gerekli.');

export const deviceSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('web'),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  device: deviceSchema,
});
export const registerSchema = z.object({
  email,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  role: z.enum(['passenger', 'driver']).default('passenger'),
  device: deviceSchema,
});
export const otpRequestSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'register']),
});
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['login', 'register']),
  code: z.string().regex(/^\d{6}$/),
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['passenger', 'driver']).default('passenger'),
  device: deviceSchema,
});
export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  profileImage: z.url().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmelidir.');

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const websocketEvents = { CONNECTION_READY: 'connection.ready', PING: 'ping', PONG: 'pong', ERROR: 'error' } as const;
export interface RealtimeEnvelope<T = unknown> {
  event: (typeof websocketEvents)[keyof typeof websocketEvents] | string;
  data: T;
  timestamp: string;
}
