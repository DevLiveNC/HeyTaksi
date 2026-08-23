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

export const coordinateSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), address: z.string().trim().min(2).max(500) });
export const vehicleTypes = ['standard', 'comfort', 'xl', 'accessible'] as const;
export const rideStatuses = ['searching', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'started', 'in_progress', 'completed', 'cancelled'] as const;
export const createRideSchema = z.object({ pickup: coordinateSchema, destination: coordinateSchema, vehicleType: z.enum(vehicleTypes) });
export const rideStatusSchema = z.enum(rideStatuses);
export type Coordinate = z.infer<typeof coordinateSchema>;
export type VehicleType = (typeof vehicleTypes)[number];
export type RideStatus = (typeof rideStatuses)[number];
export type CreateRideInput = z.infer<typeof createRideSchema>;
export interface RouteEstimate { distanceMeters: number; durationSeconds: number; geometry: { type: 'LineString'; coordinates: [number, number][] }; estimatedFare?: number; }

export const driverAvailabilities = ['offline', 'online', 'available', 'on_trip', 'paused'] as const;
export const driverAvailabilitySchema = z.enum(driverAvailabilities);
export type DriverAvailability = (typeof driverAvailabilities)[number];

/** Sürücünün kendisinin seçebildiği durumlar; `available` ve `on_trip` sistem tarafından yönetilir. */
export const driverAvailabilityTargets = ['offline', 'online', 'paused'] as const;
export const driverAvailabilityTargetSchema = z.enum(driverAvailabilityTargets);
export type DriverAvailabilityTarget = (typeof driverAvailabilityTargets)[number];

const driverAvailabilityTransitions: Record<DriverAvailability, DriverAvailabilityTarget[]> = {
  offline: ['online'],
  online: ['offline', 'paused'],
  available: ['offline', 'paused'],
  on_trip: [],
  paused: ['offline', 'online'],
};
/** Sürücünün `from` durumundayken seçebileceği hedef durumlar. `on_trip` sürücüsü yalnızca yolculuğu bitirerek durum değiştirebilir. */
export function driverAvailabilityTargetsFor(from: DriverAvailability): DriverAvailabilityTarget[] {
  return driverAvailabilityTransitions[from];
}
/** Yolculuk dağıtımına açık sürücü durumları. */
export function isDriverDispatchable(availability: DriverAvailability): boolean {
  return availability === 'online' || availability === 'available';
}

export const driverCancelReasons = ['passenger_no_show', 'wrong_location', 'vehicle_problem', 'unsafe', 'other'] as const;
export type DriverCancelReason = (typeof driverCancelReasons)[number];
export const passengerCancelReasons = ['changed_mind', 'wait_too_long', 'wrong_location', 'other'] as const;
export type PassengerCancelReason = (typeof passengerCancelReasons)[number];

export interface Hotspot {
  id: string;
  latitude: number;
  longitude: number;
  address: string;
  rideCount: number;
  demandLevel: 'low' | 'medium' | 'high';
}
export interface DriverVehicleInfo {
  id: string;
  plate: string;
  brand: string;
  model: string;
  color: string;
  vehicleType: VehicleType;
}
export interface DriverDashboard {
  availability: DriverAvailability;
  onlineStatus: boolean;
  verificationStatus: string;
  driverStatus: string;
  rating: number;
  totalRides: number;
  acceptanceRate: number;
  cancellationRate: number;
  todayEarnings: number;
  todayTrips: number;
  activeRideId: string | null;
  vehicle: DriverVehicleInfo | null;
  location: { latitude: number; longitude: number; recordedAt: string } | null;
  hotspots: Hotspot[];
}
export interface DriverRideDetail {
  id: string;
  status: RideStatus;
  vehicleType: VehicleType;
  pickup: Coordinate;
  destination: Coordinate;
  pickupAddress: string;
  destinationAddress: string;
  distanceMeters: number;
  durationSeconds: number;
  estimatedFare: number;
  finalFare: number | null;
  geometry: RouteEstimate['geometry'] | null;
  passengerName: string | null;
  passengerRating: number;
  maskedPhone: string | null;
  dialPhone: string | null;
  assignedAt: string | null;
  arrivedAt: string | null;
  waitSeconds: number;
  passengerRated: boolean;
}
export interface EarningsRide {
  id: string;
  completedAt: string;
  pickupAddress: string;
  destinationAddress: string;
  distanceMeters: number;
  durationSeconds: number;
  waitSeconds: number;
  fare: number;
  passengerName: string | null;
  stars: number | null;
}
export interface DriverEarnings {
  period: 'day' | 'week' | 'month';
  since: string;
  total: number;
  tripCount: number;
  averageFare: number;
  bestFare: number;
  onlineMinutes: number;
  rides: EarningsRide[];
}
export interface RideMessage {
  id: string;
  rideId: string;
  senderRole: 'passenger' | 'driver' | string;
  senderName: string;
  body: string;
  createdAt: string;
}
export interface RideContact {
  maskedPhone: string | null;
  dialPhone: string | null;
  passengerName: string | null;
  safetyNotes: string[];
}

export const websocketEvents = { CONNECTION_READY: 'connection.ready', AUTH: 'auth', AUTHENTICATED: 'authenticated', RIDE_SUBSCRIBE: 'ride.subscribe', RIDE_SUBSCRIBED: 'ride.subscribed', RIDE_UPDATED: 'ride.updated', RIDE_OFFER: 'ride.offer', RIDE_MESSAGE: 'ride.message', DRIVER_SUBSCRIBE: 'driver.subscribe', DRIVER_SUBSCRIBED: 'driver.subscribed', DRIVER_UPDATED: 'driver.updated', PING: 'ping', PONG: 'pong', ERROR: 'error' } as const;
export interface RealtimeEnvelope<T = unknown> {
  event: (typeof websocketEvents)[keyof typeof websocketEvents] | string;
  data: T;
  timestamp: string;
}
