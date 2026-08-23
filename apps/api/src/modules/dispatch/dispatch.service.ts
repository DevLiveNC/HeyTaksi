import {
  DISPATCH_OFFER_TTL_SECONDS,
  DISPATCH_RADIUS_STEPS_METERS,
  DISPATCH_SEARCH_TTL_SECONDS,
  estimateEtaSeconds,
  isDriverDispatchable,
  rankDispatchCandidates,
  scoreDispatchCandidate,
  type DispatchCandidate,
  type DispatchOfferView,
  type DispatchStatusView,
  type DriverAvailability,
  type VehicleType,
} from '@heytaksi/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

interface RideRow {
  id: string;
  passengerId: string;
  status: string;
  vehicleType: VehicleType;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  destinationAddress: string;
  estimatedFare: number;
  distanceMeters: number;
  durationSeconds: number;
  passengerName: string | null;
}

interface SessionRow {
  id: string;
  rideId: string;
  status: 'searching' | 'assigned' | 'exhausted' | 'cancelled';
  round: number;
  radiusMeters: number;
  vehicleType: VehicleType;
  expiresAt: Date;
}

interface EligibleDriverRow {
  driverId: string;
  driverUserId: string;
  driverName: string;
  vehicleId: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  availability: DriverAvailability;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
}

/**
 * Deterministik dağıtım motoru.
 *
 * Akış: yolcu talep eder → uygun sürücüler bulunur → araç tipine göre filtrelenir →
 * ETA hesaplanır → sürücüler sıralanır → teklif gönderilir → sürücü kabul eder → yolculuk atanır.
 * Sürücü reddeder veya süre dolarsa sıradaki sürücüye geçilir. Yapay zekâ veya rastgelelik yoktur;
 * aynı girdi her zaman aynı sıralamayı üretir.
 */
export class DispatchService {
  constructor(private readonly app: FastifyInstance) {}

  private get store() {
    return this.app.driverLocations;
  }

  /* ------------------------------ okuma ------------------------------ */

  private async ride(rideId: string): Promise<RideRow | null> {
    const result = await this.app.db.query<RideRow>(
      `SELECT r.id, r.passenger_id AS "passengerId", r.status::text AS status,
              r.vehicle_type AS "vehicleType",
              pl.latitude AS "pickupLatitude", pl.longitude AS "pickupLongitude",
              r.pickup_address AS "pickupAddress", r.destination_address AS "destinationAddress",
              p.estimated_fare::float8 AS "estimatedFare", p.distance_meters AS "distanceMeters",
              p.duration_seconds AS "durationSeconds",
              (pu.first_name||' '||pu.last_name) AS "passengerName"
       FROM rides r
       JOIN ride_pricing p ON p.ride_id=r.id
       LEFT JOIN users pu ON pu.id=r.passenger_id
       LEFT JOIN ride_locations pl ON pl.ride_id=r.id AND pl.location_type='pickup'
       WHERE r.id=$1`,
      [rideId],
    );
    return result.rows[0] ?? null;
  }

  private async session(rideId: string): Promise<SessionRow | null> {
    const result = await this.app.db.query<SessionRow>(
      `SELECT id, ride_id AS "rideId", status, round, radius_meters AS "radiusMeters",
              vehicle_type AS "vehicleType", expires_at AS "expiresAt"
       FROM dispatch_sessions WHERE ride_id=$1 AND status='searching'`,
      [rideId],
    );
    return result.rows[0] ?? null;
  }

  /** Yolculuğun bekleyen teklifi (varsa). */
  async pendingOffer(rideId: string) {
    const result = await this.app.db.query<{
      id: string;
      driverId: string;
      driverUserId: string;
      vehicleId: string | null;
      expiresAt: Date;
      etaSeconds: number;
      distanceMeters: number;
      rank: number;
    }>(
      `SELECT o.id, o.driver_id AS "driverId", d.user_id AS "driverUserId", o.vehicle_id AS "vehicleId",
              o.expires_at AS "expiresAt", o.eta_seconds AS "etaSeconds",
              o.distance_meters AS "distanceMeters", o.rank
       FROM dispatch_offers o JOIN drivers d ON d.id=o.driver_id
       WHERE o.ride_id=$1 AND o.status='pending'`,
      [rideId],
    );
    return result.rows[0] ?? null;
  }

  /** Sürücünün kendisine gelen bekleyen teklifi. */
  async pendingOfferForDriver(driverUserId: string) {
    const result = await this.app.db.query<{
      id: string;
      rideId: string;
      driverId: string;
      vehicleId: string | null;
      expiresAt: Date;
      etaSeconds: number;
      distanceMeters: number;
    }>(
      `SELECT o.id, o.ride_id AS "rideId", o.driver_id AS "driverId", o.vehicle_id AS "vehicleId",
              o.expires_at AS "expiresAt", o.eta_seconds AS "etaSeconds", o.distance_meters AS "distanceMeters"
       FROM dispatch_offers o JOIN drivers d ON d.id=o.driver_id
       WHERE d.user_id=$1 AND o.status='pending' AND o.expires_at > NOW()
       ORDER BY o.offered_at DESC LIMIT 1`,
      [driverUserId],
    );
    return result.rows[0] ?? null;
  }

  async status(rideId: string): Promise<DispatchStatusView> {
    const [session, offer, counts] = await Promise.all([
      this.session(rideId),
      this.pendingOffer(rideId),
      this.app.db.query<{ offers: number }>(
        `SELECT COUNT(*)::int AS offers FROM dispatch_offers WHERE ride_id=$1`,
        [rideId],
      ),
    ]);
    const last = await this.app.db.query<{ status: string; candidates: number }>(
      `SELECT status, 0 AS candidates FROM dispatch_sessions WHERE ride_id=$1 ORDER BY started_at DESC LIMIT 1`,
      [rideId],
    );
    let currentOffer: DispatchStatusView['currentOffer'] = null;
    if (offer) {
      const driver = await this.app.db.query<{ name: string }>(
        `SELECT (u.first_name||' '||u.last_name) AS name FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.id=$1`,
        [offer.driverId],
      );
      currentOffer = {
        driverName: driver.rows[0]?.name ?? 'Sürücü',
        etaSeconds: offer.etaSeconds,
        distanceMeters: offer.distanceMeters,
        expiresAt: new Date(offer.expiresAt).toISOString(),
      };
    }
    return {
      rideId,
      status: (session?.status ?? (last.rows[0]?.status as DispatchStatusView['status'])) ?? 'idle',
      round: session?.round ?? 0,
      radiusMeters: session?.radiusMeters ?? DISPATCH_RADIUS_STEPS_METERS[0],
      candidatesFound: 0,
      offersSent: counts.rows[0]?.offers ?? 0,
      expiresAt: session ? new Date(session.expiresAt).toISOString() : null,
      currentOffer,
    };
  }

  async offers(rideId: string): Promise<DispatchOfferView[]> {
    const result = await this.app.db.query<DispatchOfferView & { offeredAt: Date; expiresAt: Date; respondedAt: Date | null }>(
      `SELECT o.id, o.ride_id AS "rideId", o.driver_id AS "driverId",
              (u.first_name||' '||u.last_name) AS "driverName", o.status, o.rank,
              o.score::float8 AS score, o.eta_seconds AS "etaSeconds", o.distance_meters AS "distanceMeters",
              o.offered_at AS "offeredAt", o.expires_at AS "expiresAt", o.responded_at AS "respondedAt",
              o.reason_code AS "reasonCode"
       FROM dispatch_offers o JOIN drivers d ON d.id=o.driver_id JOIN users u ON u.id=d.user_id
       WHERE o.ride_id=$1 ORDER BY o.offered_at ASC`,
      [rideId],
    );
    return result.rows.map((row) => ({
      ...row,
      offeredAt: new Date(row.offeredAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      respondedAt: row.respondedAt ? new Date(row.respondedAt).toISOString() : null,
    }));
  }

  /* --------------------------- aday bulma ---------------------------- */

  /**
   * Uygun sürücüleri bulur: konum defterinden yarıçap içindekiler alınır, araç tipi,
   * doğrulama ve müsaitlik filtresinden geçirilir, ETA hesaplanır ve skora göre sıralanır.
   */
  async candidates(rideId: string, radiusMeters?: number): Promise<DispatchCandidate[]> {
    const ride = await this.ride(rideId);
    if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Yolculuk bulunamadı.');
    if (ride.pickupLatitude == null || ride.pickupLongitude == null) return [];
    const session = await this.session(rideId);
    const radius = radiusMeters ?? session?.radiusMeters ?? DISPATCH_RADIUS_STEPS_METERS[0];
    const pickup = { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude };

    // 1) Yakındaki sürücüler (Redis GEO; erişilemezse PostgreSQL).
    const nearby = await this.store.nearby(pickup, radius);
    if (!nearby.length) return [];

    // 2) Araç tipi, doğrulama, müsaitlik ve daha önce teklif gönderilmiş olma filtresi.
    const eligible = await this.app.db.query<EligibleDriverRow>(
      `SELECT d.id AS "driverId", d.user_id AS "driverUserId",
              (u.first_name||' '||u.last_name) AS "driverName",
              v.id AS "vehicleId", v.vehicle_type AS "vehicleType", v.plate,
              d.availability, d.rating::float8 AS rating,
              d.acceptance_rate::float8 AS "acceptanceRate", d.cancellation_rate::float8 AS "cancellationRate"
       FROM drivers d
       JOIN users u ON u.id=d.user_id
       JOIN LATERAL (
         SELECT v.id, v.vehicle_type, v.plate FROM vehicles v
         WHERE v.driver_id=d.id AND v.status='active' AND v.vehicle_type=$2
         ORDER BY v.created_at DESC LIMIT 1
       ) v ON TRUE
       WHERE d.id = ANY($1::uuid[])
         AND d.verification_status='verified' AND d.driver_status='active'
         AND d.availability IN ('online','available')
         AND u.status='active'
         AND NOT EXISTS (SELECT 1 FROM rides r WHERE r.driver_id=d.id AND r.status NOT IN ('completed','cancelled'))
         AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.driver_id=d.id AND o.status='pending')
         AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.ride_id=$3 AND o.driver_id=d.id
                          AND o.status IN ('rejected','expired','cancelled'))
         AND NOT EXISTS (SELECT 1 FROM ride_rejections rr WHERE rr.ride_id=$3 AND rr.driver_id=d.id)`,
      [nearby.map((row) => row.driverId), ride.vehicleType, rideId],
    );
    const byDriver = new Map(nearby.map((row) => [row.driverId, row]));

    // 3) ETA hesapla + 4) deterministik skorla sırala.
    const scored = eligible.rows.flatMap((row) => {
      const location = byDriver.get(row.driverId);
      if (!location || !isDriverDispatchable(row.availability)) return [];
      const distanceMeters = location.distanceMeters;
      const etaSeconds = estimateEtaSeconds(distanceMeters);
      const breakdown = scoreDispatchCandidate({
        distanceMeters,
        etaSeconds,
        rating: row.rating,
        acceptanceRate: row.acceptanceRate,
        cancellationRate: row.cancellationRate,
        radiusMeters: radius,
      });
      return [{
        driverId: row.driverId,
        driverUserId: row.driverUserId,
        driverName: row.driverName,
        vehicleId: row.vehicleId,
        vehicleType: row.vehicleType,
        plate: row.plate,
        distanceMeters,
        etaSeconds,
        rating: row.rating,
        acceptanceRate: row.acceptanceRate,
        cancellationRate: row.cancellationRate,
        score: breakdown.total,
        breakdown,
        rank: 0,
      } satisfies DispatchCandidate];
    });
    return rankDispatchCandidates(scored).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  }

  /* ----------------------------- akış -------------------------------- */

  /** Yolcu talebi için arama oturumunu başlatır ve ilk teklifi gönderir. */
  async start(rideId: string): Promise<DispatchStatusView> {
    const ride = await this.ride(rideId);
    if (!ride) throw new AppError(404, 'RIDE_NOT_FOUND', 'Yolculuk bulunamadı.');
    if (ride.status !== 'searching')
      throw new AppError(409, 'RIDE_NOT_SEARCHING', 'Yolculuk artık arama durumunda değil.');
    const existing = await this.session(rideId);
    if (!existing) {
      await this.app.db.query(
        `INSERT INTO dispatch_sessions(ride_id, radius_meters, vehicle_type, expires_at)
         VALUES($1,$2,$3, NOW() + make_interval(secs => $4::int))
         ON CONFLICT DO NOTHING`,
        [rideId, DISPATCH_RADIUS_STEPS_METERS[0], ride.vehicleType, DISPATCH_SEARCH_TTL_SECONDS],
      );
    }
    await this.pump(rideId);
    return this.status(rideId);
  }

  /**
   * Arama döngüsünün tek adımı: bekleyen teklif yoksa sıradaki en uygun sürücüye teklif gönderir.
   * Aday kalmazsa yarıçapı genişletir; süre dolduysa oturumu sonlandırır.
   */
  async pump(rideId: string): Promise<void> {
    const session = await this.session(rideId);
    if (!session) return;
    const ride = await this.ride(rideId);
    if (!ride || ride.status !== 'searching') {
      await this.closeSession(rideId, ride?.status === 'cancelled' ? 'cancelled' : 'assigned');
      return;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await this.exhaust(rideId, 'search_timeout');
      return;
    }
    const pending = await this.pendingOffer(rideId);
    if (pending && new Date(pending.expiresAt).getTime() > Date.now()) return;

    for (let step = session.round; step < DISPATCH_RADIUS_STEPS_METERS.length; step += 1) {
      const radius = DISPATCH_RADIUS_STEPS_METERS[step]!;
      const ranked = await this.candidates(rideId, radius);
      const best = ranked[0];
      if (best) {
        if (radius !== session.radiusMeters || step !== session.round) {
          await this.app.db.query(
            `UPDATE dispatch_sessions SET round=$2, radius_meters=$3, updated_at=NOW() WHERE id=$1`,
            [session.id, step, radius],
          );
        }
        await this.sendOffer(session.id, ride, best);
        return;
      }
    }
    // Hiçbir yarıçapta aday yok: oturum açık kalır, sonraki tur yeniden dener.
    await this.app.db.query(
      `UPDATE dispatch_sessions SET round=0, radius_meters=$2, updated_at=NOW() WHERE id=$1`,
      [session.id, DISPATCH_RADIUS_STEPS_METERS[DISPATCH_RADIUS_STEPS_METERS.length - 1]],
    );
    this.app.realtime.publishRide(rideId, {
      id: rideId,
      status: 'searching',
      dispatch: { ...(await this.status(rideId)), candidatesFound: 0 },
    });
  }

  /** Seçilen sürücüye teklifi yazar ve gerçek zamanlı bildirir. Yazılamazsa false döner. */
  private async sendOffer(sessionId: string, ride: RideRow, candidate: DispatchCandidate): Promise<boolean> {
    const expiresAt = new Date(Date.now() + DISPATCH_OFFER_TTL_SECONDS * 1000);
    let offerId: string;
    try {
      const inserted = await this.app.db.query<{ id: string }>(
        `INSERT INTO dispatch_offers(session_id, ride_id, driver_id, vehicle_id, rank, score, eta_seconds,
                                     distance_meters, score_breakdown, expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          sessionId,
          ride.id,
          candidate.driverId,
          candidate.vehicleId,
          candidate.rank,
          candidate.score,
          candidate.etaSeconds,
          candidate.distanceMeters,
          JSON.stringify(candidate.breakdown),
          expiresAt,
        ],
      );
      offerId = inserted.rows[0]!.id;
    } catch (error) {
      // Eşzamanlı başka bir teklif yazıldı (tekil kısmi indeks); sıradaki aday denenir.
      this.app.log.debug({ err: error, rideId: ride.id }, 'Teklif yazılamadı, eşzamanlı atama var.');
      return false;
    }
    this.app.log.info(
      { rideId: ride.id, driverId: candidate.driverId, rank: candidate.rank, score: candidate.score },
      'Dispatch teklifi gönderildi',
    );
    this.app.realtime.publishUser(candidate.driverUserId, 'ride.offer', {
      offerId,
      expiresAt: expiresAt.toISOString(),
      etaSeconds: candidate.etaSeconds,
      distanceMeters: candidate.distanceMeters,
      ride: await this.offerRideDetail(ride, candidate, offerId, expiresAt),
    });
    const status = await this.status(ride.id);
    this.app.realtime.publishRide(ride.id, { id: ride.id, status: 'searching', dispatch: status });
    this.app.realtime.publishDispatch('dispatch.ride', { rideId: ride.id, dispatch: status });
    return true;
  }

  /** Sürücü uygulamasının teklif ekranı için yolculuk özeti. */
  private async offerRideDetail(ride: RideRow, candidate: DispatchCandidate, offerId: string, expiresAt: Date) {
    const detail = await this.app.db.query<{
      pickupLatitude: number;
      pickupLongitude: number;
      destinationLatitude: number;
      destinationLongitude: number;
      geometry: unknown;
      passengerRating: number | null;
    }>(
      `SELECT pl.latitude AS "pickupLatitude", pl.longitude AS "pickupLongitude",
              dl.latitude AS "destinationLatitude", dl.longitude AS "destinationLongitude",
              p.route_geometry AS geometry,
              (SELECT ROUND(AVG(rr.stars)::numeric,2)::float8 FROM ride_ratings rr
                WHERE rr.ratee_id=r.passenger_id AND rr.rater_role='driver') AS "passengerRating"
       FROM rides r JOIN ride_pricing p ON p.ride_id=r.id
       LEFT JOIN ride_locations pl ON pl.ride_id=r.id AND pl.location_type='pickup'
       LEFT JOIN ride_locations dl ON dl.ride_id=r.id AND dl.location_type='destination'
       WHERE r.id=$1`,
      [ride.id],
    );
    const row = detail.rows[0];
    return {
      id: ride.id,
      status: 'driver_assigned' as const,
      vehicleType: ride.vehicleType,
      pickup: {
        latitude: row?.pickupLatitude ?? 0,
        longitude: row?.pickupLongitude ?? 0,
        address: ride.pickupAddress,
      },
      destination: {
        latitude: row?.destinationLatitude ?? 0,
        longitude: row?.destinationLongitude ?? 0,
        address: ride.destinationAddress,
      },
      pickupAddress: ride.pickupAddress,
      destinationAddress: ride.destinationAddress,
      distanceMeters: ride.distanceMeters,
      durationSeconds: ride.durationSeconds,
      estimatedFare: ride.estimatedFare,
      finalFare: null,
      geometry: row?.geometry ?? null,
      passengerName: ride.passengerName,
      passengerRating: row?.passengerRating ?? 5,
      maskedPhone: null,
      dialPhone: null,
      assignedAt: null,
      arrivedAt: null,
      waitSeconds: 0,
      passengerRated: false,
      offerId,
      offerExpiresAt: expiresAt.toISOString(),
      pickupEtaSeconds: candidate.etaSeconds,
      pickupDistanceMeters: candidate.distanceMeters,
    };
  }

  /* ---------------------------- yanıtlar ------------------------------ */

  /** Sürücü teklifi kabul eder: yolculuk atanır ve arama sona erer. */
  async accept(rideId: string, driverUserId: string): Promise<{ rideId: string }> {
    const client = await this.app.db.connect();
    let assigned: { driverId: string; vehicleId: string | null; passengerId: string } | null = null;
    try {
      await client.query('BEGIN');
      const offer = await client.query<{ id: string; driverId: string; vehicleId: string | null }>(
        `SELECT o.id, o.driver_id AS "driverId", o.vehicle_id AS "vehicleId"
         FROM dispatch_offers o JOIN drivers d ON d.id=o.driver_id
         WHERE o.ride_id=$1 AND d.user_id=$2 AND o.status='pending' FOR UPDATE OF o`,
        [rideId, driverUserId],
      );
      const row = offer.rows[0];
      if (!row) throw new AppError(409, 'OFFER_NOT_PENDING', 'Bu teklif artık geçerli değil.');
      const ride = await client.query<{ status: string; passengerId: string }>(
        `SELECT status::text AS status, passenger_id AS "passengerId" FROM rides WHERE id=$1 FOR UPDATE`,
        [rideId],
      );
      if (ride.rows[0]?.status !== 'searching')
        throw new AppError(409, 'RIDE_NOT_SEARCHING', 'Yolculuk artık arama durumunda değil.');
      const expired = await client.query<{ expired: boolean }>(
        `SELECT expires_at <= NOW() AS expired FROM dispatch_offers WHERE id=$1`,
        [row.id],
      );
      if (expired.rows[0]?.expired) throw new AppError(409, 'OFFER_EXPIRED', 'Teklif süresi doldu.');

      await client.query(
        `UPDATE dispatch_offers SET status='accepted', responded_at=NOW() WHERE id=$1`,
        [row.id],
      );
      await client.query(
        `UPDATE dispatch_sessions SET status='assigned', resolved_at=NOW(), updated_at=NOW()
         WHERE ride_id=$1 AND status='searching'`,
        [rideId],
      );
      await client.query(
        `UPDATE rides SET driver_id=$2, vehicle_id=$3, status='driver_assigned', assigned_at=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [rideId, row.driverId, row.vehicleId],
      );
      await client.query(`UPDATE drivers SET availability='on_trip', updated_at=NOW() WHERE id=$1`, [row.driverId]);
      await client.query(
        `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by)
         VALUES($1,'searching','driver_assigned',$2)`,
        [rideId, driverUserId],
      );
      await client.query('COMMIT');
      assigned = { driverId: row.driverId, vehicleId: row.vehicleId, passengerId: ride.rows[0]!.passengerId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.refreshDriverStats(assigned.driverId);
    await this.store.setAvailability(assigned.driverId, 'on_trip', rideId);
    this.app.realtime.publishUser(driverUserId, 'driver.updated', { availability: 'on_trip', onlineStatus: true });
    this.app.realtime.publishDispatch('dispatch.ride', { rideId, dispatch: await this.status(rideId) });
    return { rideId };
  }

  /** Sürücü teklifi reddeder: teklif kapanır ve sıradaki sürücüye geçilir. */
  async reject(rideId: string, driverUserId: string, reason = 'driver_rejected'): Promise<{ rideId: string }> {
    const result = await this.app.db.query<{ id: string; driverId: string }>(
      `UPDATE dispatch_offers o SET status='rejected', responded_at=NOW(), reason_code=$3
       FROM drivers d WHERE d.id=o.driver_id AND o.ride_id=$1 AND d.user_id=$2 AND o.status='pending'
       RETURNING o.id, o.driver_id AS "driverId"`,
      [rideId, driverUserId, reason],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(409, 'OFFER_NOT_PENDING', 'Bu teklif artık geçerli değil.');
    await this.app.db.query(
      `INSERT INTO ride_rejections(ride_id,driver_id,reason_code) VALUES($1,$2,$3)
       ON CONFLICT (ride_id,driver_id) DO NOTHING`,
      [rideId, row.driverId, reason],
    );
    await this.refreshDriverStats(row.driverId);
    this.app.realtime.publishUser(driverUserId, 'ride.offer.closed', { rideId, reason });
    // Sıradaki sürücüye hemen geç.
    await this.pump(rideId);
    return { rideId };
  }

  /* ------------------------- zamanlayıcı ------------------------------ */

  /**
   * Süresi dolan teklifleri kapatır ve arama oturumlarını ilerletir.
   * Zamanlayıcı tarafından saniyede bir çağrılır; idempotenttir.
   */
  async sweep(): Promise<void> {
    const expired = await this.app.db.query<{ id: string; rideId: string; driverId: string; driverUserId: string }>(
      `UPDATE dispatch_offers o SET status='expired', responded_at=NOW(), reason_code='offer_timeout'
       FROM drivers d WHERE d.id=o.driver_id AND o.status='pending' AND o.expires_at <= NOW()
       RETURNING o.id, o.ride_id AS "rideId", o.driver_id AS "driverId", d.user_id AS "driverUserId"`,
    );
    for (const row of expired.rows) {
      await this.app.db.query(
        `INSERT INTO ride_rejections(ride_id,driver_id,reason_code) VALUES($1,$2,'offer_timeout')
         ON CONFLICT (ride_id,driver_id) DO NOTHING`,
        [row.rideId, row.driverId],
      );
      await this.refreshDriverStats(row.driverId);
      this.app.realtime.publishUser(row.driverUserId, 'ride.offer.closed', {
        rideId: row.rideId,
        reason: 'offer_timeout',
      });
    }
    // Süresi dolan arama oturumları.
    const timedOut = await this.app.db.query<{ rideId: string }>(
      `SELECT ride_id AS "rideId" FROM dispatch_sessions WHERE status='searching' AND expires_at <= NOW()`,
    );
    for (const row of timedOut.rows) await this.exhaust(row.rideId, 'search_timeout');

    // Açık oturumları ilerlet (teklifi olmayanlar sıradaki sürücüyü alır).
    const open = await this.app.db.query<{ rideId: string }>(
      `SELECT s.ride_id AS "rideId" FROM dispatch_sessions s
       WHERE s.status='searching'
         AND NOT EXISTS (SELECT 1 FROM dispatch_offers o WHERE o.ride_id=s.ride_id AND o.status='pending')`,
    );
    for (const row of open.rows) await this.pump(row.rideId);
  }

  /** Arama süresi dolduğunda yolcuya bildirilir; yolculuk iptal edilmez, yeniden denenebilir. */
  private async exhaust(rideId: string, reason: string): Promise<void> {
    await this.app.db.query(
      `UPDATE dispatch_sessions SET status='exhausted', resolved_at=NOW(), updated_at=NOW()
       WHERE ride_id=$1 AND status='searching'`,
      [rideId],
    );
    await this.cancelPendingOffers(rideId, reason);
    const status = await this.status(rideId);
    this.app.realtime.publishRide(rideId, { id: rideId, status: 'searching', dispatch: status });
    this.app.realtime.publishDispatch('dispatch.ride', { rideId, dispatch: status });
    this.app.log.info({ rideId, reason }, 'Dispatch araması sonuçsuz kapandı');
  }

  private async closeSession(rideId: string, status: 'assigned' | 'cancelled'): Promise<void> {
    await this.app.db.query(
      `UPDATE dispatch_sessions SET status=$2, resolved_at=NOW(), updated_at=NOW() WHERE ride_id=$1 AND status='searching'`,
      [rideId, status],
    );
  }

  /** Yolculuk iptal edildiğinde arama ve bekleyen teklifler kapatılır. */
  async cancel(rideId: string, reason = 'ride_cancelled'): Promise<void> {
    await this.closeSession(rideId, 'cancelled');
    await this.cancelPendingOffers(rideId, reason);
  }

  private async cancelPendingOffers(rideId: string, reason: string): Promise<void> {
    const cancelled = await this.app.db.query<{ driverUserId: string; driverId: string }>(
      `UPDATE dispatch_offers o SET status='cancelled', responded_at=NOW(), reason_code=$2
       FROM drivers d WHERE d.id=o.driver_id AND o.ride_id=$1 AND o.status='pending'
       RETURNING d.user_id AS "driverUserId", o.driver_id AS "driverId"`,
      [rideId, reason],
    );
    for (const row of cancelled.rows)
      this.app.realtime.publishUser(row.driverUserId, 'ride.offer.closed', { rideId, reason });
  }

  /** Sürücü çevrim dışı olur veya mola verirse bekleyen teklifi düşer ve arama devam eder. */
  async releaseDriver(driverId: string, reason = 'driver_unavailable'): Promise<void> {
    const cancelled = await this.app.db.query<{ rideId: string; driverUserId: string }>(
      `UPDATE dispatch_offers o SET status='cancelled', responded_at=NOW(), reason_code=$2
       FROM drivers d WHERE d.id=o.driver_id AND o.driver_id=$1 AND o.status='pending'
       RETURNING o.ride_id AS "rideId", d.user_id AS "driverUserId"`,
      [driverId, reason],
    );
    for (const row of cancelled.rows) {
      this.app.realtime.publishUser(row.driverUserId, 'ride.offer.closed', { rideId: row.rideId, reason });
      await this.pump(row.rideId);
    }
  }

  /**
   * Kabul ve iptal oranlarını teklif geçmişinden yeniden hesaplar.
   * Deterministik: oranlar yalnızca kayıtlı olaylardan türetilir.
   */
  async refreshDriverStats(driverId: string): Promise<void> {
    await this.app.db.query(
      `UPDATE drivers d SET
         acceptance_rate = COALESCE((
           SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE o.status='accepted') / NULLIF(COUNT(*),0), 2)
           FROM dispatch_offers o
           WHERE o.driver_id=d.id AND o.status IN ('accepted','rejected','expired')
         ), 100),
         cancellation_rate = COALESCE((
           SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE c.cancelled_by = d.user_id) / NULLIF(COUNT(*),0), 2)
           FROM rides r LEFT JOIN ride_cancellations c ON c.ride_id=r.id
           WHERE r.driver_id=d.id AND r.status IN ('completed','cancelled')
         ), 0),
         updated_at = NOW()
       WHERE d.id=$1`,
      [driverId],
    );
  }
}
