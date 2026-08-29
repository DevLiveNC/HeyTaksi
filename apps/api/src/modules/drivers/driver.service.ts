import type { FastifyInstance } from 'fastify';
import {
  driverAvailabilityTargetsFor,
  type DriverAvailability,
  type DriverAvailabilityTarget,
  type DriverDashboard,
  type DriverEarnings,
  type DriverVehicleInfo,
  type Hotspot,
} from '@heytaksi/shared';
import { AppError } from '../../core/errors/app-error.js';

export type EarningsPeriod = 'day' | 'week' | 'month';
export const earningsPeriods: EarningsPeriod[] = ['day', 'week', 'month'];

/** Teklif kabul penceresi: süresi dolan atamalar aramaya geri döner. */
export const OFFER_TTL_SECONDS = 20;
/** Hotspot penceresi: son 3 saatte alınan talepler yoğunluk haritasını besler. */
export const HOTSPOT_WINDOW_HOURS = 3;

export class DriverService {
  constructor(private readonly app: FastifyInstance) {}

  private async requireDriverId(userId: string): Promise<string> {
    const result = await this.app.db.query<{ id: string }>(
      'SELECT id FROM drivers WHERE user_id=$1',
      [userId],
    );
    if (!result.rows[0]) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Sürücü profili bulunamadı.');
    return result.rows[0].id;
  }

  async dashboard(userId: string): Promise<DriverDashboard> {
    const driverId = await this.requireDriverId(userId);
    const [profile, active, earningsToday, vehicle, location, hotspots] = await Promise.all([
      this.app.db.query<{
        availability: DriverAvailability;
        onlineStatus: boolean;
        verificationStatus: string;
        driverStatus: string;
        rating: string;
        totalRides: number;
        acceptanceRate: string;
        cancellationRate: string;
      }>(
        `SELECT availability, online_status AS "onlineStatus", verification_status AS "verificationStatus",
                driver_status AS "driverStatus", rating, total_rides AS "totalRides",
                acceptance_rate AS "acceptanceRate", cancellation_rate AS "cancellationRate"
         FROM drivers WHERE id=$1`,
        [driverId],
      ),
      this.app.db.query<{ id: string }>(
        `SELECT id FROM rides WHERE driver_id=$1 AND status NOT IN ('completed','cancelled') LIMIT 1`,
        [driverId],
      ),
      this.app.db.query<{ total: string | null; trips: number }>(
        `SELECT SUM(COALESCE(p.final_fare,p.estimated_fare)) AS total, COUNT(*)::int AS trips
         FROM rides r JOIN ride_pricing p ON p.ride_id=r.id
         WHERE r.driver_id=$1 AND r.status='completed' AND r.completed_at >= date_trunc('day', NOW())`,
        [driverId],
      ),
      this.app.db.query<DriverVehicleInfo>(
        `SELECT id, plate, brand, model, color, vehicle_type AS "vehicleType"
         FROM vehicles WHERE driver_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
        [driverId],
      ),
      this.app.db.query<{ latitude: number; longitude: number; recordedAt: string }>(
        `SELECT latitude, longitude, recorded_at AS "recordedAt" FROM driver_locations WHERE driver_id=$1`,
        [driverId],
      ),
      this.hotspots(),
    ]);
    const row = profile.rows[0]!;
    const money = earningsToday.rows[0]!;
    return {
      availability: row.availability,
      onlineStatus: row.onlineStatus,
      verificationStatus: row.verificationStatus,
      driverStatus: row.driverStatus,
      rating: Number(row.rating),
      totalRides: row.totalRides,
      acceptanceRate: Number(row.acceptanceRate),
      cancellationRate: Number(row.cancellationRate),
      todayEarnings: Number(money.total ?? 0),
      todayTrips: money.trips,
      activeRideId: active.rows[0]?.id ?? null,
      vehicle: vehicle.rows[0] ?? null,
      location: location.rows[0] ?? null,
      hotspots,
    };
  }

  async setAvailability(userId: string, target: DriverAvailabilityTarget): Promise<{ availability: DriverAvailability; onlineStatus: boolean }> {
    const driver = await this.app.db.query<{
      id: string;
      availability: DriverAvailability;
      verificationStatus: string;
      driverStatus: string;
    }>(
      `SELECT id, availability, verification_status AS "verificationStatus", driver_status AS "driverStatus"
       FROM drivers WHERE user_id=$1`,
      [userId],
    );
    const row = driver.rows[0];
    if (!row) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Sürücü profili bulunamadı.');
    // Idempotenslik: yeniden bağlanan istemci aynı durumu tekrar isteyebilir.
    // 'online' isteği, sistemin dağıtıma açık saydığı 'available' durumunda da başarılıdır.
    const alreadyThere =
      target === row.availability || (target === 'online' && row.availability === 'available');
    if (alreadyThere) {
      const current = await this.app.db.query<{ availability: DriverAvailability; onlineStatus: boolean }>(
        `SELECT availability, online_status AS "onlineStatus" FROM drivers WHERE id=$1`,
        [row.id],
      );
      return current.rows[0]!;
    }
    const allowed = driverAvailabilityTargetsFor(row.availability);
    if (!allowed.includes(target)) {
      throw new AppError(
        409,
        'AVAILABILITY_TRANSITION_INVALID',
        row.availability === 'on_trip'
          ? 'Yolculuk sürerken durum değiştirilemez; önce yolculuğu tamamlayın veya iptal edin.'
          : `${row.availability} durumundan ${target} durumuna geçilemez.`,
      );
    }
    if (target !== 'offline' && (row.verificationStatus !== 'verified' || row.driverStatus !== 'active')) {
      throw new AppError(409, 'DRIVER_NOT_VERIFIED', 'Çevrim içi olmak için sürücü doğrulaması tamamlanmalıdır.');
    }
    // Manuel 'online' seçimi sürücüyü dağıtıma açık 'online' durumuna alır; 'available' sistem tarafından kullanılır.
    const next: DriverAvailability = target === 'online' ? 'online' : target;
    const onlineStatus = next !== 'offline';
    const updated = await this.app.db.query<{ availability: DriverAvailability; onlineStatus: boolean }>(
      `UPDATE drivers SET availability=$2, online_status=$3, updated_at=NOW()
       WHERE id=$1 RETURNING availability, online_status AS "onlineStatus"`,
      [row.id, next, onlineStatus],
    );
    const result = updated.rows[0]!;
    // Faz 6: durum değişimi Redis konum defterine ve operasyon paneline yansır.
    this.app.locationService.invalidate(userId);
    await this.app.locationService.syncAvailability(userId, result.availability).catch((error) => {
      this.app.log.warn({ err: error }, 'Sürücü durumu konum defterine yansıtılamadı.');
    });
    // Dağıtıma kapanan sürücünün bekleyen teklifi düşer; diğer sürücüler yanıtlamaya devam eder.
    if (next === 'offline' || next === 'paused')
      await this.app.dispatch.releaseDriver(row.id, `driver_${next}`).catch(() => undefined);
    this.app.realtime.publishUser(userId, 'driver.updated', result);
    return result;
  }

  /**
   * REST konum sinyali. WebSocket kanalı birincil yoldur; bu uç, soket kapalıyken
   * veya arka planda çalışan istemciler için yedek olarak korunur.
   */
  async updateLocation(
    userId: string,
    location: { latitude: number; longitude: number; heading?: number | undefined; accuracyMeters?: number | undefined; speedMps?: number | undefined },
  ): Promise<{ latitude: number; longitude: number; recordedAt: string }> {
    const snapshot = await this.app.locationService.recordDriverPing(userId, location);
    return {
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      recordedAt: snapshot.recordedAt,
    };
  }

  async hotspots(): Promise<Hotspot[]> {
    const result = await this.app.db.query<{
      id: string;
      latitude: number;
      longitude: number;
      address: string;
      rideCount: number;
    }>(
      `WITH recent AS (
         SELECT rl.latitude, rl.longitude, rl.address, rl.recorded_at
         FROM ride_locations rl
         WHERE rl.location_type='pickup' AND rl.recorded_at >= NOW() - make_interval(hours => $1::int)
       )
       SELECT round(latitude::numeric,2)::text || ':' || round(longitude::numeric,2)::text AS id,
              round(latitude::numeric,2)::float8 AS latitude,
              round(longitude::numeric,2)::float8 AS longitude,
              (array_agg(address ORDER BY recorded_at DESC))[1] AS address,
              COUNT(*)::int AS "rideCount"
       FROM recent GROUP BY 1,2,3 ORDER BY "rideCount" DESC LIMIT 6`,
      [HOTSPOT_WINDOW_HOURS],
    );
    return result.rows.map((row) => ({
      ...row,
      demandLevel: row.rideCount >= 8 ? 'high' : row.rideCount >= 4 ? 'medium' : 'low',
    }));
  }

  async earnings(userId: string, period: EarningsPeriod): Promise<DriverEarnings> {
    const driverId = await this.requireDriverId(userId);
    const since = period === 'day'
      ? "date_trunc('day', NOW())"
      : period === 'week'
        ? "date_trunc('week', NOW())"
        : "date_trunc('month', NOW())";
    const rides = await this.app.db.query<{
      id: string;
      completedAt: string;
      pickupAddress: string;
      destinationAddress: string;
      distanceMeters: number;
      durationSeconds: number;
      waitSeconds: number | null;
      fare: string;
      passengerName: string | null;
      stars: number | null;
    }>(
      `SELECT r.id, r.completed_at AS "completedAt", r.pickup_address AS "pickupAddress",
              r.destination_address AS "destinationAddress",
              p.distance_meters AS "distanceMeters", p.duration_seconds AS "durationSeconds",
              COALESCE((SELECT EXTRACT(EPOCH FROM (
                 (SELECT MIN(created_at) FROM ride_status_history h WHERE h.ride_id=r.id AND h.to_status='started')
                 - (SELECT MIN(created_at) FROM ride_status_history h WHERE h.ride_id=r.id AND h.to_status='driver_arrived')
               ))::int), 0) AS "waitSeconds",
              COALESCE(p.final_fare,p.estimated_fare)::numeric(10,2) AS fare,
              pu.first_name||' '||pu.last_name AS "passengerName",
              (SELECT rr.stars FROM ride_ratings rr WHERE rr.ride_id=r.id AND rr.ratee_id=u.id LIMIT 1) AS stars
       FROM rides r
       JOIN ride_pricing p ON p.ride_id=r.id
       JOIN drivers d ON d.id=r.driver_id JOIN users u ON u.id=d.user_id
       LEFT JOIN users pu ON pu.id=r.passenger_id
       WHERE d.id=$1 AND r.status='completed' AND r.completed_at >= ${since}
       ORDER BY r.completed_at DESC`,
      [driverId],
    );
    const onlineMinutes = await this.app.db.query<{ minutes: number }>(
      // Çevrim içi süre tahmini: sürücü uygulaması çevrim içiyken dakika bazında konum gönderir.
      `SELECT COUNT(DISTINCT date_trunc('minute', recorded_at))::int AS minutes
       FROM driver_locations WHERE driver_id=$1 AND recorded_at >= ${since}`,
      [driverId],
    );
    const fares = rides.rows.map((row) => Number(row.fare));
    const now = new Date();
    const periodStart = period === 'day'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
      : period === 'week'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const total = fares.reduce((sum, fare) => sum + fare, 0);
    return {
      period,
      since: periodStart.toISOString(),
      total: Math.round(total * 100) / 100,
      tripCount: rides.rows.length,
      averageFare: fares.length ? Math.round((total / fares.length) * 100) / 100 : 0,
      bestFare: fares.length ? Math.max(...fares) : 0,
      onlineMinutes: onlineMinutes.rows[0]?.minutes ?? 0,
      rides: rides.rows.map((row) => ({ ...row, fare: Number(row.fare), waitSeconds: row.waitSeconds ?? 0 })),
    };
  }
}
