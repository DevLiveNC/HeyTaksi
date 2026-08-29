import {
  DRIVER_LOCATION_TTL_SECONDS,
  haversineMeters,
  type DriverAvailability,
  type DriverLocationSnapshot,
  type VehicleType,
} from '@heytaksi/shared';
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

/** Aktif sürücü konumlarının Redis anahtarları. */
const GEO_KEY = 'drivers:geo';
const HASH_KEY = 'drivers:state';
const SEEN_KEY = 'drivers:seen';

interface StoredState {
  driverId: string;
  heading: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  availability: DriverAvailability;
  vehicleType: VehicleType | null;
  rideId: string | null;
  recordedAt: string;
  latitude: number;
  longitude: number;
}

/**
 * Aktif sürücü konum defteri.
 *
 * Birincil kaynak Redis'tir: GEO index yakınlık sorgusunu O(log n) yapar, hash sürücü
 * durumunu tutar ve sorted set son görülme zamanını tutarak bayat kayıtları temizler.
 * Redis erişilemezse PostgreSQL `driver_locations` tablosu fallback olarak kullanılır;
 * böylece dispatch tek bir bileşen yüzünden durmaz.
 */
export class DriverLocationStore {
  constructor(private readonly app: FastifyInstance) {}

  private get redis(): Redis {
    return this.app.redis;
  }

  private get usable(): boolean {
    return this.redis.status === 'ready';
  }

  /** Konumu Redis'e yazar ve kalıcılık için PostgreSQL'e işler. */
  async upsert(input: {
    driverId: string;
    latitude: number;
    longitude: number;
    heading?: number | null;
    speedMps?: number | null;
    accuracyMeters?: number | null;
    availability: DriverAvailability;
    vehicleType?: VehicleType | null;
    rideId?: string | null;
  }): Promise<DriverLocationSnapshot> {
    const snapshot: DriverLocationSnapshot = {
      driverId: input.driverId,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading ?? null,
      speedMps: input.speedMps ?? null,
      accuracyMeters: input.accuracyMeters ?? null,
      availability: input.availability,
      vehicleType: input.vehicleType ?? null,
      rideId: input.rideId ?? null,
      recordedAt: new Date().toISOString(),
    };
    if (this.usable) {
      try {
        const state: StoredState = { ...snapshot };
        await this.redis
          .multi()
          .geoadd(GEO_KEY, input.longitude, input.latitude, input.driverId)
          .hset(HASH_KEY, input.driverId, JSON.stringify(state))
          .zadd(SEEN_KEY, Date.now(), input.driverId)
          .exec();
      } catch (error) {
        this.app.log.warn({ err: error }, 'Sürücü konumu Redis’e yazılamadı; PostgreSQL kullanılıyor.');
      }
    }
    await this.app.db.query(
      `INSERT INTO driver_locations(driver_id, latitude, longitude, heading, accuracy_meters, speed_mps, availability, ride_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (driver_id) DO UPDATE SET latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude,
         heading=EXCLUDED.heading, accuracy_meters=EXCLUDED.accuracy_meters, speed_mps=EXCLUDED.speed_mps,
         availability=EXCLUDED.availability, ride_id=EXCLUDED.ride_id, recorded_at=NOW()`,
      [
        input.driverId,
        input.latitude,
        input.longitude,
        snapshot.heading,
        snapshot.accuracyMeters,
        snapshot.speedMps,
        input.availability,
        snapshot.rideId,
      ],
    );
    return snapshot;
  }

  /** Sürücü çevrim dışı olduğunda aktif konum defterinden çıkarılır. */
  async remove(driverId: string): Promise<void> {
    if (this.usable) {
      try {
        await this.redis.multi().zrem(GEO_KEY, driverId).hdel(HASH_KEY, driverId).zrem(SEEN_KEY, driverId).exec();
      } catch (error) {
        this.app.log.warn({ err: error }, 'Sürücü konumu Redis’ten silinemedi.');
      }
    }
    await this.app.db.query(`UPDATE driver_locations SET availability='offline' WHERE driver_id=$1`, [driverId]);
  }

  /** Yalnızca durum değişti; konum korunur. */
  async setAvailability(driverId: string, availability: DriverAvailability, rideId: string | null = null): Promise<void> {
    if (availability === 'offline') {
      await this.remove(driverId);
      return;
    }
    if (this.usable) {
      try {
        const raw = await this.redis.hget(HASH_KEY, driverId);
        if (raw) {
          const state = JSON.parse(raw) as StoredState;
          state.availability = availability;
          state.rideId = rideId;
          await this.redis.hset(HASH_KEY, driverId, JSON.stringify(state));
        }
      } catch (error) {
        this.app.log.warn({ err: error }, 'Sürücü durumu Redis’te güncellenemedi.');
      }
    }
    await this.app.db.query(
      `UPDATE driver_locations SET availability=$2, ride_id=$3 WHERE driver_id=$1`,
      [driverId, availability, rideId],
    );
  }

  async get(driverId: string): Promise<DriverLocationSnapshot | null> {
    if (this.usable) {
      try {
        const raw = await this.redis.hget(HASH_KEY, driverId);
        if (raw) return JSON.parse(raw) as DriverLocationSnapshot;
      } catch (error) {
        this.app.log.warn({ err: error }, 'Sürücü konumu Redis’ten okunamadı.');
      }
    }
    return this.fromDatabase(driverId);
  }

  private async fromDatabase(driverId: string): Promise<DriverLocationSnapshot | null> {
    const result = await this.app.db.query<DriverLocationSnapshot & { recordedAt: Date }>(
      `SELECT l.driver_id AS "driverId", l.latitude, l.longitude, l.heading::float8 AS heading,
              l.speed_mps::float8 AS "speedMps", l.accuracy_meters::float8 AS "accuracyMeters",
              d.availability, l.ride_id AS "rideId", l.recorded_at AS "recordedAt",
              (SELECT v.vehicle_type FROM vehicles v WHERE v.driver_id=d.id AND v.status='active'
               ORDER BY v.created_at DESC LIMIT 1) AS "vehicleType"
       FROM driver_locations l JOIN drivers d ON d.id=l.driver_id
       WHERE l.driver_id=$1 AND l.recorded_at >= NOW() - make_interval(secs => $2::int)`,
      [driverId, DRIVER_LOCATION_TTL_SECONDS],
    );
    const row = result.rows[0];
    return row ? { ...row, recordedAt: new Date(row.recordedAt).toISOString() } : null;
  }

  /**
   * Verilen merkez etrafındaki, TTL içinde sinyal göndermiş sürücüler.
   * Redis GEOSEARCH birincil yol; erişilemezse PostgreSQL üzerinden kaba kutu filtresi uygulanır.
   */
  async nearby(
    center: { latitude: number; longitude: number },
    radiusMeters: number,
  ): Promise<Array<DriverLocationSnapshot & { distanceMeters: number }>> {
    const cutoff = Date.now() - DRIVER_LOCATION_TTL_SECONDS * 1000;
    if (this.usable) {
      try {
        await this.pruneStale(cutoff);
        const rows = (await this.redis.geosearch(
          GEO_KEY,
          'FROMLONLAT',
          center.longitude,
          center.latitude,
          'BYRADIUS',
          radiusMeters,
          'm',
          'ASC',
          'WITHCOORD',
          'WITHDIST',
        )) as Array<[string, string, [string, string]]>;
        if (!rows.length) return [];
        const states = await this.redis.hmget(HASH_KEY, ...rows.map(([id]) => id));
        const result: Array<DriverLocationSnapshot & { distanceMeters: number }> = [];
        rows.forEach(([driverId, distance, coordinates], index) => {
          const raw = states[index];
          if (!raw) return;
          const state = JSON.parse(raw) as StoredState;
          if (new Date(state.recordedAt).getTime() < cutoff) return;
          result.push({
            ...state,
            driverId,
            longitude: Number(coordinates[0]),
            latitude: Number(coordinates[1]),
            distanceMeters: Math.round(Number(distance)),
          });
        });
        return result;
      } catch (error) {
        this.app.log.warn({ err: error }, 'Redis yakınlık sorgusu başarısız; PostgreSQL kullanılıyor.');
      }
    }
    return this.nearbyFromDatabase(center, radiusMeters);
  }

  private async nearbyFromDatabase(
    center: { latitude: number; longitude: number },
    radiusMeters: number,
  ): Promise<Array<DriverLocationSnapshot & { distanceMeters: number }>> {
    // Kaba kutu filtresi (1° enlem ≈ 111 km) sonrası kesin haversine mesafesi uygulanır.
    const latitudeDelta = radiusMeters / 111_000;
    const longitudeDelta = radiusMeters / (111_000 * Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180)));
    const result = await this.app.db.query<DriverLocationSnapshot & { recordedAt: Date }>(
      `SELECT l.driver_id AS "driverId", l.latitude, l.longitude, l.heading::float8 AS heading,
              l.speed_mps::float8 AS "speedMps", l.accuracy_meters::float8 AS "accuracyMeters",
              d.availability, l.ride_id AS "rideId", l.recorded_at AS "recordedAt",
              (SELECT v.vehicle_type FROM vehicles v WHERE v.driver_id=d.id AND v.status='active'
               ORDER BY v.created_at DESC LIMIT 1) AS "vehicleType"
       FROM driver_locations l JOIN drivers d ON d.id=l.driver_id
       WHERE l.recorded_at >= NOW() - make_interval(secs => $1::int)
         AND l.latitude BETWEEN $2 AND $3 AND l.longitude BETWEEN $4 AND $5`,
      [
        DRIVER_LOCATION_TTL_SECONDS,
        center.latitude - latitudeDelta,
        center.latitude + latitudeDelta,
        center.longitude - longitudeDelta,
        center.longitude + longitudeDelta,
      ],
    );
    return result.rows
      .map((row) => ({
        ...row,
        recordedAt: new Date(row.recordedAt).toISOString(),
        distanceMeters: Math.round(haversineMeters(center, row)),
      }))
      .filter((row) => row.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  /** Canlı harita için tüm aktif sürücüler. */
  async all(): Promise<DriverLocationSnapshot[]> {
    const cutoff = Date.now() - DRIVER_LOCATION_TTL_SECONDS * 1000;
    if (this.usable) {
      try {
        await this.pruneStale(cutoff);
        const states = await this.redis.hgetall(HASH_KEY);
        return Object.values(states)
          .map((raw) => JSON.parse(raw) as DriverLocationSnapshot)
          .filter((state) => new Date(state.recordedAt).getTime() >= cutoff);
      } catch (error) {
        this.app.log.warn({ err: error }, 'Redis sürücü listesi okunamadı; PostgreSQL kullanılıyor.');
      }
    }
    const result = await this.app.db.query<DriverLocationSnapshot & { recordedAt: Date }>(
      `SELECT l.driver_id AS "driverId", l.latitude, l.longitude, l.heading::float8 AS heading,
              l.speed_mps::float8 AS "speedMps", l.accuracy_meters::float8 AS "accuracyMeters",
              d.availability, l.ride_id AS "rideId", l.recorded_at AS "recordedAt",
              (SELECT v.vehicle_type FROM vehicles v WHERE v.driver_id=d.id AND v.status='active'
               ORDER BY v.created_at DESC LIMIT 1) AS "vehicleType"
       FROM driver_locations l JOIN drivers d ON d.id=l.driver_id
       WHERE l.recorded_at >= NOW() - make_interval(secs => $1::int) AND d.availability <> 'offline'`,
      [DRIVER_LOCATION_TTL_SECONDS],
    );
    return result.rows.map((row) => ({ ...row, recordedAt: new Date(row.recordedAt).toISOString() }));
  }

  /** TTL süresini aşan sürücüleri aktif defterden düşürür. */
  private async pruneStale(cutoff: number): Promise<void> {
    const stale = await this.redis.zrangebyscore(SEEN_KEY, '-inf', cutoff);
    if (!stale.length) return;
    await this.redis.multi().zrem(GEO_KEY, ...stale).hdel(HASH_KEY, ...stale).zrem(SEEN_KEY, ...stale).exec();
  }
}
