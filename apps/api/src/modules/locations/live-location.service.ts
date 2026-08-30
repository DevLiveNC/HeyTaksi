import {
  DRIVER_LOCATION_TTL_SECONDS,
  estimateEtaSeconds,
  haversineMeters,
  isDriverDispatchable,
  type DispatchOverview,
  type DriverAvailability,
  type DriverLocationSnapshot,
  type LiveDriverMarker,
  type LiveRideMarker,
  type LocationPing,
  type VehicleType,
} from '@heytaksi/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

interface DriverContext {
  driverId: string;
  driverName: string;
  availability: DriverAvailability;
  vehicleType: VehicleType | null;
  plate: string | null;
  rating: number;
  activeRideId: string | null;
}

/**
 * Canlı konum servisi: sürücü ve yolcu konum sinyallerini alır, Redis'e yazar ve
 * ilgili kanallara (yolculuk katılımcıları + operasyon paneli) gerçek zamanlı yayar.
 */
export class LiveLocationService {
  private readonly contextCache = new Map<string, { value: DriverContext; expiresAt: number }>();

  constructor(private readonly app: FastifyInstance) {}

  /** Sürücü kimliği ve profil bilgisi; yüksek frekanslı sinyallerde 15 saniye önbelleklenir. */
  private async driverContext(userId: string): Promise<DriverContext> {
    const cached = this.contextCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const result = await this.app.db.query<DriverContext>(
      `SELECT d.id AS "driverId", (u.first_name||' '||u.last_name) AS "driverName",
              d.availability, d.rating::float8 AS rating,
              v.vehicle_type AS "vehicleType", v.plate,
              (SELECT r.id FROM rides r WHERE r.driver_id=d.id AND r.status NOT IN ('completed','cancelled')
               ORDER BY r.created_at DESC LIMIT 1) AS "activeRideId"
       FROM drivers d JOIN users u ON u.id=d.user_id
       LEFT JOIN LATERAL (SELECT v.vehicle_type, v.plate FROM vehicles v
         WHERE v.driver_id=d.id AND v.status='active' ORDER BY v.created_at DESC LIMIT 1) v ON TRUE
       WHERE d.user_id=$1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Sürücü profili bulunamadı.');
    this.contextCache.set(userId, { value: row, expiresAt: Date.now() + 15_000 });
    return row;
  }

  /** Konum sinyali sonrası önbellek geçersizleşir (durum veya yolculuk değişimi). */
  invalidate(userId: string): void {
    this.contextCache.delete(userId);
  }

  /**
   * Sürücü konum sinyali. Redis'e yazılır, aktif yolculuk kanalına ve operasyon paneline yayılır.
   * Sürücü çevrim dışıysa sinyal kalıcı defterde tutulur ama dağıtıma açılmaz.
   */
  async recordDriverPing(userId: string, ping: LocationPing): Promise<DriverLocationSnapshot> {
    const context = await this.driverContext(userId);
    const rideId = ping.rideId ?? context.activeRideId;
    const snapshot = await this.app.driverLocations.upsert({
      driverId: context.driverId,
      latitude: ping.latitude,
      longitude: ping.longitude,
      heading: ping.heading ?? null,
      speedMps: ping.speedMps ?? null,
      accuracyMeters: ping.accuracyMeters ?? null,
      availability: context.availability,
      vehicleType: context.vehicleType,
      rideId,
    });

    // Aktif yolculuk varsa yolcuya canlı konum akar.
    if (rideId) {
      const payload = {
        rideId,
        driverLocation: {
          latitude: snapshot.latitude,
          longitude: snapshot.longitude,
          heading: snapshot.heading,
          speedMps: snapshot.speedMps,
          recordedAt: snapshot.recordedAt,
        },
      };
      this.app.realtime.publishRideEvent(rideId, 'ride.location', payload);
      // Faz 4/5 istemcileri `ride.updated` bekliyor; geriye dönük uyumluluk korunur.
      this.app.realtime.publishRide(rideId, payload);
      await this.app.db.query(
        `INSERT INTO ride_locations(ride_id,location_type,latitude,longitude,heading,accuracy_meters)
         VALUES($1,'driver',$2,$3,$4,$5)`,
        [rideId, ping.latitude, ping.longitude, ping.heading ?? null, ping.accuracyMeters ?? null],
      );
    }

    // Operasyon paneli yalnızca dinleyici varken beslenir.
    if (this.app.realtime.hasDispatchListeners()) {
      this.app.realtime.publishDispatch('dispatch.driver.moved', {
        ...snapshot,
        driverName: context.driverName,
        plate: context.plate,
        rating: context.rating,
        ageSeconds: 0,
      } satisfies LiveDriverMarker);
    }

    // Çevrim içi sürücü görünür olur olmaz yakındaki açık aramalara teklif gider.
    if (isDriverDispatchable(context.availability)) {
      await this.app.dispatch.considerNearbySearches(context.driverId).catch((error) => {
        this.app.log.warn({ err: error, driverId: context.driverId }, 'Yakındaki aramalar sürücü sinyalinde ilerletilemedi.');
      });
    }
    return snapshot;
  }

  /** Yolcu konumu: yalnızca aktif yolculuğun sürücüsüne iletilir, kalıcı olarak saklanır. */
  async recordPassengerPing(userId: string, rideId: string, ping: LocationPing): Promise<void> {
    const allowed = await this.app.db.query<{ status: string }>(
      `SELECT status::text AS status FROM rides WHERE id=$1 AND passenger_id=$2 AND status NOT IN ('completed','cancelled')`,
      [rideId, userId],
    );
    if (!allowed.rowCount) throw new AppError(403, 'FORBIDDEN', 'Bu yolculuğa konum gönderemezsiniz.');
    await this.app.db.query(
      `INSERT INTO ride_locations(ride_id,location_type,latitude,longitude,heading,accuracy_meters)
       VALUES($1,'passenger',$2,$3,$4,$5)`,
      [rideId, ping.latitude, ping.longitude, ping.heading ?? null, ping.accuracyMeters ?? null],
    );
    this.app.realtime.publishRideEvent(rideId, 'passenger.location', {
      rideId,
      passengerLocation: {
        latitude: ping.latitude,
        longitude: ping.longitude,
        heading: ping.heading ?? null,
        recordedAt: new Date().toISOString(),
      },
    });
  }

  /** Sürücü durumu değiştiğinde konum defteri ve operasyon paneli senkronize edilir. */
  async syncAvailability(userId: string, availability: DriverAvailability): Promise<void> {
    this.invalidate(userId);
    const context = await this.driverContext(userId);
    if (availability === 'offline') {
      await this.app.driverLocations.remove(context.driverId);
      this.app.realtime.publishDispatch('dispatch.driver.left', { driverId: context.driverId });
      return;
    }
    await this.app.driverLocations.setAvailability(context.driverId, availability, context.activeRideId);
    const snapshot = await this.app.driverLocations.get(context.driverId);
    if (snapshot)
      this.app.realtime.publishDispatch('dispatch.driver.moved', {
        ...snapshot,
        availability,
        driverName: context.driverName,
        plate: context.plate,
        rating: context.rating,
        ageSeconds: 0,
      } satisfies LiveDriverMarker);
  }

  /** Yolcuya gösterilecek yakın sürücüler (anonim: kimlik bilgisi verilmez). */
  async nearbyForPassenger(
    center: { latitude: number; longitude: number },
    radiusMeters = 5000,
  ): Promise<Array<{ id: string; latitude: number; longitude: number; heading: number | null; vehicleType: VehicleType | null; etaSeconds: number }>> {
    const drivers = await this.app.driverLocations.nearby(center, radiusMeters);
    return drivers
      .filter((driver) => driver.availability === 'online' || driver.availability === 'available')
      .slice(0, 12)
      .map((driver) => ({
        // Yolcuya sürücü kimliği açılmaz; yalnızca haritada gösterim için kısa takma anahtar.
        id: driver.driverId.slice(0, 8),
        latitude: driver.latitude,
        longitude: driver.longitude,
        heading: driver.heading,
        vehicleType: driver.vehicleType,
        etaSeconds: estimateEtaSeconds(haversineMeters(center, driver)),
      }));
  }

  /** Operasyon paneli anlık görüntüsü: canlı sürücüler + aktif yolculuklar. */
  async overview(): Promise<DispatchOverview> {
    const snapshots = await this.app.driverLocations.all();
    const now = Date.now();
    const drivers: LiveDriverMarker[] = [];
    if (snapshots.length) {
      const profiles = await this.app.db.query<{
        driverId: string;
        driverName: string;
        plate: string | null;
        rating: number;
        availability: DriverAvailability;
      }>(
        `SELECT d.id AS "driverId", (u.first_name||' '||u.last_name) AS "driverName",
                v.plate, d.rating::float8 AS rating, d.availability
         FROM drivers d JOIN users u ON u.id=d.user_id
         LEFT JOIN LATERAL (SELECT v.plate FROM vehicles v WHERE v.driver_id=d.id AND v.status='active'
           ORDER BY v.created_at DESC LIMIT 1) v ON TRUE
         WHERE d.id = ANY($1::uuid[])`,
        [snapshots.map((snapshot) => snapshot.driverId)],
      );
      const byId = new Map(profiles.rows.map((row) => [row.driverId, row]));
      for (const snapshot of snapshots) {
        const profile = byId.get(snapshot.driverId);
        if (!profile) continue;
        drivers.push({
          ...snapshot,
          // Durum kaynağı veritabanıdır; Redis kaydı bayat kalabilir.
          availability: profile.availability,
          driverName: profile.driverName,
          plate: profile.plate,
          rating: profile.rating,
          ageSeconds: Math.max(0, Math.round((now - new Date(snapshot.recordedAt).getTime()) / 1000)),
        });
      }
    }

    const rideRows = await this.app.db.query<{
      rideId: string;
      status: LiveRideMarker['status'];
      vehicleType: VehicleType;
      passengerName: string | null;
      driverName: string | null;
      pickupLatitude: number | null;
      pickupLongitude: number | null;
      pickupAddress: string;
      destinationLatitude: number | null;
      destinationLongitude: number | null;
      destinationAddress: string;
      driverId: string | null;
      createdAt: Date;
      waitingSeconds: number;
    }>(
      `SELECT r.id AS "rideId", r.status, r.vehicle_type AS "vehicleType",
              (pu.first_name||' '||pu.last_name) AS "passengerName",
              (du.first_name||' '||du.last_name) AS "driverName",
              pl.latitude AS "pickupLatitude", pl.longitude AS "pickupLongitude", r.pickup_address AS "pickupAddress",
              dl.latitude AS "destinationLatitude", dl.longitude AS "destinationLongitude",
              r.destination_address AS "destinationAddress",
              r.driver_id AS "driverId", r.created_at AS "createdAt",
              EXTRACT(EPOCH FROM (NOW()-r.created_at))::int AS "waitingSeconds"
       FROM rides r
       LEFT JOIN users pu ON pu.id=r.passenger_id
       LEFT JOIN drivers d ON d.id=r.driver_id LEFT JOIN users du ON du.id=d.user_id
       LEFT JOIN ride_locations pl ON pl.ride_id=r.id AND pl.location_type='pickup'
       LEFT JOIN ride_locations dl ON dl.ride_id=r.id AND dl.location_type='destination'
       WHERE r.status NOT IN ('completed','cancelled')
       ORDER BY r.created_at DESC LIMIT 200`,
    );
    const driverPositions = new Map(drivers.map((driver) => [driver.driverId, driver]));
    const rides: LiveRideMarker[] = rideRows.rows.map((row) => {
      const position = row.driverId ? driverPositions.get(row.driverId) : undefined;
      return {
        rideId: row.rideId,
        status: row.status,
        vehicleType: row.vehicleType,
        passengerName: row.passengerName,
        driverName: row.driverName,
        pickup: {
          latitude: row.pickupLatitude ?? 0,
          longitude: row.pickupLongitude ?? 0,
          address: row.pickupAddress,
        },
        destination: {
          latitude: row.destinationLatitude ?? 0,
          longitude: row.destinationLongitude ?? 0,
          address: row.destinationAddress,
        },
        driverLocation: position
          ? { latitude: position.latitude, longitude: position.longitude, heading: position.heading }
          : null,
        createdAt: new Date(row.createdAt).toISOString(),
        waitingSeconds: row.waitingSeconds,
      };
    });

    return {
      drivers,
      rides,
      counts: {
        online: drivers.filter((driver) => driver.availability === 'online').length,
        available: drivers.filter((driver) => driver.availability === 'available').length,
        onTrip: drivers.filter((driver) => driver.availability === 'on_trip').length,
        paused: drivers.filter((driver) => driver.availability === 'paused').length,
        searchingRides: rides.filter((ride) => ride.status === 'searching').length,
        activeRides: rides.filter((ride) => ride.status !== 'searching').length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /** Konum sinyali TTL'i; istemciler bu değere göre gönderim aralığını ayarlar. */
  get ttlSeconds(): number {
    return DRIVER_LOCATION_TTL_SECONDS;
  }
}
