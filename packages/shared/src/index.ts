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
  /** Faz 6 — bekleyen dağıtım teklifinde doldurulur; atanmış yolculukta boştur. */
  offerId?: string | null;
  offerExpiresAt?: string | null;
  pickupEtaSeconds?: number | null;
  pickupDistanceMeters?: number | null;
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

export const rideHistoryFilters = ['all', 'completed', 'cancelled', 'upcoming'] as const;
export type RideHistoryFilter = (typeof rideHistoryFilters)[number];
export const rideHistoryQuerySchema = z.object({
  status: z.enum(rideHistoryFilters).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RideHistoryQuery = z.infer<typeof rideHistoryQuerySchema>;

export interface RideHistoryItem {
  id: string;
  status: RideStatus;
  vehicleType: VehicleType;
  pickupAddress: string;
  destinationAddress: string;
  pickup: Coordinate;
  destination: Coordinate;
  distanceMeters: number;
  durationSeconds: number;
  estimatedFare: number;
  finalFare: number | null;
  geometry: RouteEstimate['geometry'] | null;
  driverName: string | null;
  vehicle: string | null;
  plate: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  rideId: string | null;
  read: boolean;
  createdAt: string;
}

export const paymentBrands = ['visa', 'mastercard', 'amex', 'troy'] as const;
export type PaymentBrand = (typeof paymentBrands)[number];
export const walletTopupSchema = z.object({
  amount: z.number().min(50).max(5000),
  methodId: z.uuid().optional(),
});
export const paymentMethodCreateSchema = z.object({
  brand: z.enum(paymentBrands),
  last4: z.string().regex(/^\d{4}$/),
  holderName: z.string().trim().min(2).max(80),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(new Date().getFullYear()).max(2040),
  isDefault: z.boolean().optional(),
});
export type WalletTopupInput = z.infer<typeof walletTopupSchema>;
export type PaymentMethodCreateInput = z.infer<typeof paymentMethodCreateSchema>;

export interface PaymentMethod {
  id: string;
  brand: PaymentBrand | string;
  last4: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: string;
}
export interface WalletTransaction {
  id: string;
  type: 'topup' | 'ride_charge' | 'refund' | 'adjustment';
  amount: number;
  balanceAfter: number;
  description: string;
  rideId: string | null;
  createdAt: string;
}
export interface WalletView {
  balance: number;
  currency: string;
  methods: PaymentMethod[];
  transactions: WalletTransaction[];
}

export const supportTicketCreateSchema = z.object({
  subject: z.string().trim().min(4).max(200),
  message: z.string().trim().min(8).max(4000),
  rideId: z.uuid().optional(),
});
export const supportTicketStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);
export type SupportTicketStatus = z.infer<typeof supportTicketStatusSchema>;
export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  rideId: string | null;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
}

export const adminPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(80).optional(),
});

export const websocketEvents = {
  CONNECTION_READY: 'connection.ready', AUTH: 'auth', AUTHENTICATED: 'authenticated',
  RIDE_SUBSCRIBE: 'ride.subscribe', RIDE_SUBSCRIBED: 'ride.subscribed', RIDE_UPDATED: 'ride.updated',
  RIDE_OFFER: 'ride.offer', RIDE_OFFER_CLOSED: 'ride.offer.closed', RIDE_MESSAGE: 'ride.message',
  RIDE_LOCATION: 'ride.location', RIDE_DISPATCH: 'ride.dispatch',
  DRIVER_SUBSCRIBE: 'driver.subscribe', DRIVER_SUBSCRIBED: 'driver.subscribed', DRIVER_UPDATED: 'driver.updated',
  DRIVER_LOCATION: 'driver.location', DRIVER_LOCATION_ACK: 'driver.location.ack',
  PASSENGER_LOCATION: 'passenger.location',
  DISPATCH_SUBSCRIBE: 'dispatch.subscribe', DISPATCH_SUBSCRIBED: 'dispatch.subscribed',
  DISPATCH_DRIVERS: 'dispatch.drivers', DISPATCH_DRIVER_MOVED: 'dispatch.driver.moved',
  DISPATCH_DRIVER_LEFT: 'dispatch.driver.left', DISPATCH_RIDE: 'dispatch.ride',
  PING: 'ping', PONG: 'pong', ERROR: 'error',
} as const;
export interface RealtimeEnvelope<T = unknown> {
  event: (typeof websocketEvents)[keyof typeof websocketEvents] | string;
  data: T;
  timestamp: string;
}

/* ------------------------------------------------------------------ *
 * Faz 6 — gerçek zamanlı konum ve deterministik dispatch sözleşmeleri
 * ------------------------------------------------------------------ */

/** Sürücü konum sinyali: WebSocket veya REST üzerinden aynı şema kullanılır. */
export const locationPingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speedMps: z.number().min(0).max(90).optional(),
  accuracyMeters: z.number().min(0).max(5000).optional(),
  rideId: z.uuid().optional(),
});
export type LocationPing = z.infer<typeof locationPingSchema>;

/** Sürücü konum sinyali aralığı (saniye) ve bayat kabul edilme sınırı. */
export const DRIVER_LOCATION_INTERVAL_SECONDS = 5;
export const DRIVER_LOCATION_TTL_SECONDS = 60;
/** Teklif kabul penceresi (saniye): dolduğunda yanıt vermeyen sürücülerin teklifi kapanır. */
export const DISPATCH_OFFER_TTL_SECONDS = 20;
/** Bir yolculuk için toplam arama süresi (saniye). */
export const DISPATCH_SEARCH_TTL_SECONDS = 180;
/** Arama yarıçapları (metre): aday kalmazsa bir sonraki yarıçapa genişler. */
export const DISPATCH_RADIUS_STEPS_METERS = [3000, 6000, 12000] as const;
/**
 * Aynı anda teklif gönderilecek en fazla sürücü sayısı.
 * Yakındaki tüm uygun sürücülere eşzamanlı bildirim gider; ilk kabul eden yolcuyu alır.
 */
export const DISPATCH_BROADCAST_MAX_DRIVERS = 50;

/** Skor sırasındaki adaylardan yayın alıcılarını seçer (üst sınır dahil). */
export function selectBroadcastRecipients<T>(ranked: T[], max = DISPATCH_BROADCAST_MAX_DRIVERS): T[] {
  return ranked.slice(0, Math.max(0, max));
}

export interface DriverLocationSnapshot {
  driverId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  availability: DriverAvailability;
  vehicleType: VehicleType | null;
  rideId: string | null;
  recordedAt: string;
}

export interface LiveDriverMarker extends DriverLocationSnapshot {
  driverName: string;
  plate: string | null;
  rating: number;
  /** Konum sinyalinin yaşı (saniye); UI bayat işaretçileri soluklaştırır. */
  ageSeconds: number;
}

/** Dispatch skor bileşenleri: her biri 0-1 aralığında normalize edilir. */
export interface DispatchScoreBreakdown {
  distance: number;
  eta: number;
  rating: number;
  acceptance: number;
  cancellation: number;
  total: number;
}

/** Deterministik sıralamada kullanılan ağırlıklar; toplamı 1.0'dır. AI yoktur. */
export const dispatchWeights = {
  distance: 0.35,
  eta: 0.25,
  rating: 0.15,
  acceptance: 0.15,
  cancellation: 0.1,
} as const;

export interface DispatchCandidate {
  driverId: string;
  driverUserId: string;
  driverName: string;
  vehicleId: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  distanceMeters: number;
  etaSeconds: number;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  score: number;
  breakdown: DispatchScoreBreakdown;
  rank: number;
}

export const dispatchOfferStatuses = ['pending', 'accepted', 'rejected', 'expired', 'cancelled'] as const;
export type DispatchOfferStatus = (typeof dispatchOfferStatuses)[number];
export const dispatchSessionStatuses = ['searching', 'assigned', 'exhausted', 'cancelled'] as const;
export type DispatchSessionStatus = (typeof dispatchSessionStatuses)[number];

export interface DispatchOfferView {
  id: string;
  rideId: string;
  driverId: string;
  driverName: string;
  status: DispatchOfferStatus;
  rank: number;
  score: number;
  etaSeconds: number;
  distanceMeters: number;
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
  reasonCode: string | null;
}

/** Yolcuya ve operasyona gösterilen arama durumu. */
export interface DispatchStatusView {
  rideId: string;
  status: DispatchSessionStatus | 'idle';
  round: number;
  radiusMeters: number;
  candidatesFound: number;
  offersSent: number;
  /** Şu anda yanıt beklenen eşzamanlı teklif sayısı (yayın). */
  pendingOffers: number;
  expiresAt: string | null;
  /** En yakın bekleyen teklif; yayın sırasında yolcuya ETA göstermek için. */
  currentOffer: {
    driverName: string;
    etaSeconds: number;
    distanceMeters: number;
    expiresAt: string;
  } | null;
}

/** Frontend harita eklentisinin hangi sağlayıcıyı kullanacağı. */
export type MapProvider = 'google' | 'osm';
export interface MapsClientConfig {
  provider: MapProvider;
  browserKey: string | null;
  mapId: string | null;
}

export interface LiveRideMarker {
  rideId: string;
  status: RideStatus;
  vehicleType: VehicleType;
  passengerName: string | null;
  driverName: string | null;
  pickup: { latitude: number; longitude: number; address: string };
  destination: { latitude: number; longitude: number; address: string };
  driverLocation: { latitude: number; longitude: number; heading: number | null } | null;
  createdAt: string;
  waitingSeconds: number;
}

export interface DispatchOverview {
  drivers: LiveDriverMarker[];
  rides: LiveRideMarker[];
  counts: {
    online: number;
    available: number;
    onTrip: number;
    paused: number;
    searchingRides: number;
    activeRides: number;
  };
  generatedAt: string;
}

/** Haversine mesafesi (metre) — dispatch ve UI aynı formülü paylaşır. */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = radians(b.latitude - a.latitude);
  const deltaLongitude = radians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Şehir içi ortalama hız (km/sa) ile yol sapma payı; ETA deterministik hesaplanır. */
export const ETA_CITY_SPEED_KMH = 26;
export const ETA_ROAD_FACTOR = 1.35;
export const ETA_PICKUP_OVERHEAD_SECONDS = 45;

/** Kuş uçuşu mesafeden varış süresi tahmini (saniye). Rota servisi yoksa da çalışır. */
export function estimateEtaSeconds(directDistanceMeters: number): number {
  const roadMeters = directDistanceMeters * ETA_ROAD_FACTOR;
  const seconds = (roadMeters / 1000 / ETA_CITY_SPEED_KMH) * 3600 + ETA_PICKUP_OVERHEAD_SECONDS;
  return Math.max(60, Math.round(seconds));
}

/**
 * Deterministik sürücü skoru: yakınlık, ETA, puan, kabul oranı ve iptal oranı.
 * Her bileşen 0-1 aralığına normalize edilir, ağırlıklandırılır ve 0-100 arasına ölçeklenir.
 * Aynı girdi her zaman aynı çıktıyı üretir (rastgelelik veya model yoktur).
 */
export function scoreDispatchCandidate(input: {
  distanceMeters: number;
  etaSeconds: number;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  radiusMeters: number;
}): DispatchScoreBreakdown {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const distance = clamp(1 - input.distanceMeters / Math.max(1, input.radiusMeters));
  // 15 dakikadan uzun ETA sıfır puan alır.
  const eta = clamp(1 - input.etaSeconds / 900);
  const rating = clamp((input.rating - 3) / 2);
  const acceptance = clamp(input.acceptanceRate / 100);
  const cancellation = clamp(1 - input.cancellationRate / 100);
  const total =
    distance * dispatchWeights.distance +
    eta * dispatchWeights.eta +
    rating * dispatchWeights.rating +
    acceptance * dispatchWeights.acceptance +
    cancellation * dispatchWeights.cancellation;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return {
    distance: round2(distance),
    eta: round2(eta),
    rating: round2(rating),
    acceptance: round2(acceptance),
    cancellation: round2(cancellation),
    total: round2(total * 100),
  };
}

/**
 * Adayları deterministik olarak sıralar: önce skor, eşitlikte ETA, mesafe ve driverId.
 * Sıralama kararlıdır; aynı liste her çağrıda aynı sırayı verir.
 */
export function rankDispatchCandidates<T extends { score: number; etaSeconds: number; distanceMeters: number; driverId: string }>(
  candidates: T[],
): T[] {
  return [...candidates].sort(
    (a, b) =>
      b.score - a.score ||
      a.etaSeconds - b.etaSeconds ||
      a.distanceMeters - b.distanceMeters ||
      a.driverId.localeCompare(b.driverId),
  );
}
