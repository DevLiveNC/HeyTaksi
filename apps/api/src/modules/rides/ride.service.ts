import type {
  CreateRideInput,
  DriverRideDetail,
  RideContact,
  RideHistoryItem,
  RideHistoryQuery,
  RideMessage,
  RideStatus,
  VehicleType,
} from "@heytaksi/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../core/errors/app-error.js";
/** Atanmış ama ilerlemeyen yolculuk için güvenlik ağı (saniye); teklif zaman aşımı dispatch motorundadır. */
const ASSIGNMENT_STALE_SECONDS = 90;
import { MapService } from "../locations/map.service.js";
import { maskPhone } from "../../core/utils/phone.js";
import { createNotification } from "../notifications/index.js";
import { PaymentService } from "../payments/index.js";
const multipliers: Record<VehicleType, number> = {
  standard: 1,
  comfort: 1.35,
  xl: 1.6,
  accessible: 1.15,
};

const RIDE_HISTORY_SELECT = `SELECT r.id,r.status,r.vehicle_type AS "vehicleType",
  r.pickup_address AS "pickupAddress", r.destination_address AS "destinationAddress",
  r.created_at AS "createdAt", r.completed_at AS "completedAt",
  p.distance_meters AS "distanceMeters", p.duration_seconds AS "durationSeconds",
  p.estimated_fare::float8 AS "estimatedFare", p.final_fare::float8 AS "finalFare",
  p.route_geometry AS geometry, u.first_name||' '||u.last_name AS "driverName",
  v.plate, v.brand||' '||v.model AS vehicle,
  pl.latitude AS "pickupLatitude", pl.longitude AS "pickupLongitude",
  dl.latitude AS "destinationLatitude", dl.longitude AS "destinationLongitude"
 FROM rides r
 JOIN ride_pricing p ON p.ride_id=r.id
 LEFT JOIN drivers d ON d.id=r.driver_id
 LEFT JOIN users u ON u.id=d.user_id
 LEFT JOIN vehicles v ON v.id=r.vehicle_id
 LEFT JOIN LATERAL (SELECT latitude, longitude FROM ride_locations WHERE ride_id=r.id AND location_type='pickup' ORDER BY recorded_at DESC LIMIT 1) pl ON TRUE
 LEFT JOIN LATERAL (SELECT latitude, longitude FROM ride_locations WHERE ride_id=r.id AND location_type='destination' ORDER BY recorded_at DESC LIMIT 1) dl ON TRUE`;
const transitions: Record<RideStatus, RideStatus[]> = {
  searching: ["driver_assigned", "cancelled"],
  driver_assigned: ["driver_arriving", "cancelled"],
  driver_arriving: ["driver_arrived", "cancelled"],
  driver_arrived: ["started", "cancelled"],
  started: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
export class RideService {
  private maps = new MapService();
  private payments: PaymentService;
  constructor(private app: FastifyInstance) {
    this.payments = new PaymentService(app.db);
  }
  async create(passengerId: string, input: CreateRideInput) {
    const route = await this.maps.route(input.pickup, input.destination);
    const multiplier = multipliers[input.vehicleType];
    const base = 45,
      distance = (route.distanceMeters / 1000) * 18,
      time = (route.durationSeconds / 60) * 1.2,
      estimated = Math.max(90, (base + distance + time) * multiplier);
    const client = await this.app.db.connect();
    try {
      await client.query("BEGIN");
      const ride = (
        await client.query<{ id: string }>(
          `INSERT INTO rides(passenger_id,vehicle_type,pickup_address,destination_address) VALUES($1,$2,$3,$4) RETURNING id`,
          [
            passengerId,
            input.vehicleType,
            input.pickup.address,
            input.destination.address,
          ],
        )
      ).rows[0]!;
      await client.query(
        `INSERT INTO ride_locations(ride_id,location_type,latitude,longitude,address) VALUES($1,'pickup',$2,$3,$4),($1,'destination',$5,$6,$7)`,
        [
          ride.id,
          input.pickup.latitude,
          input.pickup.longitude,
          input.pickup.address,
          input.destination.latitude,
          input.destination.longitude,
          input.destination.address,
        ],
      );
      await client.query(
        `INSERT INTO ride_pricing(ride_id,distance_meters,duration_seconds,base_fare,distance_fare,time_fare,multiplier,estimated_fare,route_geometry) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ride.id,
          route.distanceMeters,
          route.durationSeconds,
          base,
          distance,
          time,
          multiplier,
          estimated,
          route.geometry,
        ],
      );
      await client.query(
        `INSERT INTO ride_status_history(ride_id,to_status,changed_by) VALUES($1,'searching',$2)`,
        [ride.id, passengerId],
      );
      await client.query("COMMIT");
      const result = await this.get(ride.id, passengerId);
      this.app.realtime.publishRide(ride.id, result);
      await createNotification(this.app.db, {
        userId: passengerId,
        title: "Taksi aranıyor",
        body: `${input.destination.address} için talebin yakındaki sürücülere iletildi.`,
        rideId: ride.id,
      }).catch(() => undefined);
      // Faz 6: talep alınır alınmaz deterministik dağıtım araması başlar.
      await this.app.dispatch.start(ride.id).catch((error) => {
        this.app.log.error({ err: error, rideId: ride.id }, "Dağıtım araması başlatılamadı");
      });
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async get(id: string, userId: string) {
    const result = await this.app.db.query(
      `${RIDE_HISTORY_SELECT} WHERE r.id=$1 AND (r.passenger_id=$2 OR d.user_id=$2)`,
      [id, userId],
    );
    if (!result.rows[0])
      throw new AppError(404, "RIDE_NOT_FOUND", "Yolculuk bulunamadı.");
    return this.mapHistoryRow(result.rows[0]);
  }
  async list(userId: string, role: string, query: RideHistoryQuery): Promise<RideHistoryItem[]> {
    const owner = role === "driver" ? "d.user_id=$1" : "r.passenger_id=$1";
    const status =
      query.status === "completed"
        ? " AND r.status='completed'"
        : query.status === "cancelled"
          ? " AND r.status='cancelled'"
          : query.status === "upcoming"
            ? " AND r.status NOT IN ('completed','cancelled')"
            : "";
    const result = await this.app.db.query(
      `${RIDE_HISTORY_SELECT} WHERE ${owner}${status} ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, query.limit, (query.page - 1) * query.limit],
    );
    return result.rows.map((row) => this.mapHistoryRow(row));
  }
  async current(passengerId: string) {
    await this.releaseStaleAssignments();
    const result = await this.app.db.query<{ id: string }>(
      `SELECT id FROM rides WHERE passenger_id=$1 AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 1`,
      [passengerId],
    );
    return result.rows[0] ? this.get(result.rows[0].id, passengerId) : null;
  }
  /** Sürücünün bekleyen teklifi veya aktif yolculuğu; süresi dolan atamalar önce aramaya döner. */
  async driverActiveRide(driverUserId: string): Promise<DriverRideDetail | null> {
    await this.releaseStaleAssignments(driverUserId);
    // Faz 6: henüz kabul edilmemiş dağıtım teklifi aktif yolculuktan önce gelir.
    const offer = await this.app.dispatch.pendingOfferForDriver(driverUserId);
    if (offer) {
      const detail = await this.offerDetail(offer.rideId, offer);
      if (detail) return detail;
    }
    const result = await this.app.db.query<{ id: string }>(
      `SELECT r.id FROM rides r JOIN drivers d ON d.id=r.driver_id
       WHERE d.user_id=$1 AND r.status NOT IN ('completed','cancelled')
       ORDER BY r.created_at DESC LIMIT 1`,
      [driverUserId],
    );
    return result.rows[0] ? this.driverRideDetail(result.rows[0].id, driverUserId) : null;
  }
  /** Bekleyen dağıtım teklifini sürücü ekranı sözleşmesine dönüştürür (henüz atama yoktur). */
  private async offerDetail(
    rideId: string,
    offer: { id: string; expiresAt: Date; etaSeconds: number; distanceMeters: number },
  ): Promise<DriverRideDetail | null> {
    const result = await this.app.db.query<{
      id: string;
      vehicleType: DriverRideDetail["vehicleType"];
      pickupAddress: string;
      destinationAddress: string;
      pickupLatitude: number | null;
      pickupLongitude: number | null;
      destinationLatitude: number | null;
      destinationLongitude: number | null;
      distanceMeters: number;
      durationSeconds: number;
      estimatedFare: number;
      geometry: DriverRideDetail["geometry"];
      passengerName: string | null;
      passengerRating: number | null;
    }>(
      `SELECT r.id, r.vehicle_type AS "vehicleType",
        r.pickup_address AS "pickupAddress", r.destination_address AS "destinationAddress",
        pl.latitude AS "pickupLatitude", pl.longitude AS "pickupLongitude",
        dl.latitude AS "destinationLatitude", dl.longitude AS "destinationLongitude",
        p.distance_meters AS "distanceMeters", p.duration_seconds AS "durationSeconds",
        p.estimated_fare::float8 AS "estimatedFare", p.route_geometry AS geometry,
        (pu.first_name||' '||pu.last_name) AS "passengerName",
        (SELECT ROUND(AVG(rr.stars)::numeric,2)::float8 FROM ride_ratings rr
          WHERE rr.ratee_id=r.passenger_id AND rr.rater_role='driver') AS "passengerRating"
       FROM rides r JOIN ride_pricing p ON p.ride_id=r.id
       LEFT JOIN users pu ON pu.id=r.passenger_id
       LEFT JOIN ride_locations pl ON pl.ride_id=r.id AND pl.location_type='pickup'
       LEFT JOIN ride_locations dl ON dl.ride_id=r.id AND dl.location_type='destination'
       WHERE r.id=$1 AND r.status='searching'`,
      [rideId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: "driver_assigned",
      vehicleType: row.vehicleType,
      pickup: { latitude: row.pickupLatitude ?? 0, longitude: row.pickupLongitude ?? 0, address: row.pickupAddress },
      destination: {
        latitude: row.destinationLatitude ?? 0,
        longitude: row.destinationLongitude ?? 0,
        address: row.destinationAddress,
      },
      pickupAddress: row.pickupAddress,
      destinationAddress: row.destinationAddress,
      distanceMeters: row.distanceMeters,
      durationSeconds: row.durationSeconds,
      estimatedFare: row.estimatedFare,
      finalFare: null,
      geometry: row.geometry,
      passengerName: row.passengerName,
      passengerRating: row.passengerRating ?? 5,
      maskedPhone: null,
      dialPhone: null,
      assignedAt: null,
      arrivedAt: null,
      waitSeconds: 0,
      passengerRated: false,
      offerId: offer.id,
      offerExpiresAt: new Date(offer.expiresAt).toISOString(),
      pickupEtaSeconds: offer.etaSeconds,
      pickupDistanceMeters: offer.distanceMeters,
    };
  }
  async driverRideDetail(rideId: string, driverUserId: string): Promise<DriverRideDetail> {
    const result = await this.app.db.query<{
      id: string;
      status: RideStatus;
      vehicleType: string;
      pickupAddress: string;
      destinationAddress: string;
      pickupLatitude: number | null;
      pickupLongitude: number | null;
      destinationLatitude: number | null;
      destinationLongitude: number | null;
      distanceMeters: number;
      durationSeconds: number;
      estimatedFare: number;
      finalFare: number | null;
      geometry: DriverRideDetail["geometry"];
      passengerName: string | null;
      passengerPhone: string | null;
      passengerRating: number | null;
      assignedAt: string | null;
      arrivedAt: string | null;
      waitSeconds: number;
      passengerRated: boolean;
    }>(
      `SELECT r.id,r.status,r.vehicle_type AS "vehicleType",
       r.pickup_address AS "pickupAddress",r.destination_address AS "destinationAddress",
       pl.latitude AS "pickupLatitude",pl.longitude AS "pickupLongitude",
       dl.latitude AS "destinationLatitude",dl.longitude AS "destinationLongitude",
       p.distance_meters AS "distanceMeters",p.duration_seconds AS "durationSeconds",
       p.estimated_fare::float8 AS "estimatedFare",p.final_fare::float8 AS "finalFare",
       p.route_geometry AS geometry,
       (pu.first_name||' '||pu.last_name) AS "passengerName",pu.phone AS "passengerPhone",
       (SELECT ROUND(AVG(rr.stars)::numeric,2)::float8 FROM ride_ratings rr
         WHERE rr.ratee_id=r.passenger_id AND rr.rater_role='driver') AS "passengerRating",
       r.assigned_at AS "assignedAt",
       arr.created_at AS "arrivedAt",
       COALESCE(EXTRACT(EPOCH FROM (NOW()-arr.created_at))::int,0) AS "waitSeconds",
       EXISTS(SELECT 1 FROM ride_ratings rr WHERE rr.ride_id=r.id AND rr.rater_id=u.id) AS "passengerRated"
       FROM rides r
       JOIN drivers d ON d.id=r.driver_id JOIN users u ON u.id=d.user_id
       LEFT JOIN users pu ON pu.id=r.passenger_id
       JOIN ride_pricing p ON p.ride_id=r.id
       LEFT JOIN ride_locations pl ON pl.ride_id=r.id AND pl.location_type='pickup'
       LEFT JOIN ride_locations dl ON dl.ride_id=r.id AND dl.location_type='destination'
       LEFT JOIN LATERAL (SELECT h.created_at FROM ride_status_history h
         WHERE h.ride_id=r.id AND h.to_status='driver_arrived' ORDER BY h.created_at DESC LIMIT 1) arr ON TRUE
       WHERE r.id=$1 AND d.user_id=$2`,
      [rideId, driverUserId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, "RIDE_NOT_FOUND", "Yolculuk bulunamadı.");
    return {
      id: row.id,
      status: row.status,
      vehicleType: row.vehicleType as DriverRideDetail["vehicleType"],
      pickup: { latitude: row.pickupLatitude ?? 0, longitude: row.pickupLongitude ?? 0, address: row.pickupAddress },
      destination: { latitude: row.destinationLatitude ?? 0, longitude: row.destinationLongitude ?? 0, address: row.destinationAddress },
      pickupAddress: row.pickupAddress,
      destinationAddress: row.destinationAddress,
      distanceMeters: row.distanceMeters,
      durationSeconds: row.durationSeconds,
      estimatedFare: row.estimatedFare,
      finalFare: row.finalFare,
      geometry: row.geometry,
      passengerName: row.passengerName,
      passengerRating: row.passengerRating ?? 5,
      maskedPhone: maskPhone(row.passengerPhone),
      dialPhone: row.passengerPhone,
      assignedAt: row.assignedAt,
      arrivedAt: row.arrivedAt,
      waitSeconds: row.status === "driver_arrived" ? row.waitSeconds : 0,
      passengerRated: row.passengerRated,
    };
  }
  /** Kabul penceresi dolan atamaları aramaya döndürür. */
  async releaseStaleAssignments(driverUserId?: string): Promise<void> {
    const params: unknown[] = [ASSIGNMENT_STALE_SECONDS];
    let filter = "";
    if (driverUserId) {
      params.push(driverUserId);
      filter = " AND d.user_id=$2";
    }
    const stale = await this.app.db.query<{ id: string; driver_user_id: string }>(
      `SELECT r.id, d.user_id AS driver_user_id FROM rides r JOIN drivers d ON d.id=r.driver_id
       WHERE r.status='driver_assigned' AND r.assigned_at < NOW() - make_interval(secs => $1::int)${filter}`,
      params,
    );
    for (const row of stale.rows) await this.unassignRide(row.id!, row.driver_user_id!, "offer_timeout");
  }
  private async unassignRide(rideId: string, driverUserId: string, reason: string): Promise<void> {
    const client = await this.app.db.connect();
    try {
      await client.query("BEGIN");
      const ride = await client.query<{ driver_id: string | null }>(
        `SELECT driver_id FROM rides WHERE id=$1 AND status='driver_assigned' FOR UPDATE`,
        [rideId],
      );
      const assigned = ride.rows[0]?.driver_id;
      if (!assigned) {
        await client.query("COMMIT");
        return;
      }
      await client.query(
        `UPDATE rides SET driver_id=NULL,vehicle_id=NULL,status='searching',assigned_at=NULL,updated_at=NOW() WHERE id=$1`,
        [rideId],
      );
      await client.query(
        `INSERT INTO ride_rejections(ride_id,driver_id,reason_code) VALUES($1,$2,$3)
         ON CONFLICT (ride_id,driver_id) DO NOTHING`,
        [rideId, assigned, reason],
      );
      await client.query(
        `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) VALUES($1,'driver_assigned','searching',$2)`,
        [rideId, driverUserId],
      );
      await client.query(
        `UPDATE drivers SET availability='available',online_status=TRUE,updated_at=NOW() WHERE id=$1`,
        [assigned],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Atama kaldırıldı; yolcu tarafına aramaya dönüş bildirimi gönder (sürücü artık katılımcı değil).
    this.app.realtime.publishRide(rideId, {
      id: rideId,
      status: "searching",
      driverName: null,
      plate: null,
      vehicle: null,
    });
    this.app.realtime.publishUser(driverUserId, "driver.updated", {
      availability: "available",
      onlineStatus: true,
      releasedFrom: reason,
    });
    await this.app.locationService.syncAvailability(driverUserId, "available").catch(() => undefined);
  }
  /**
   * Sürücü teklifi kabul eder.
   * Faz 6: bekleyen dağıtım teklifi varsa atama burada yapılır (searching → driver_assigned),
   * ardından yolculuk driver_arriving durumuna geçer.
   */
  async accept(rideId: string, driverUserId: string): Promise<DriverRideDetail> {
    const pending = await this.app.dispatch.pendingOffer(rideId);
    if (pending) await this.app.dispatch.accept(rideId, driverUserId);
    else await this.releaseStaleAssignments(driverUserId);
    const current = await this.driverRideDetail(rideId, driverUserId);
    if (current.status !== "driver_assigned")
      throw new AppError(409, "RIDE_NOT_ASSIGNABLE", "Bu teklif artık geçerli değil.");
    await this.app.db.query(
      `UPDATE rides SET status='driver_arriving',updated_at=NOW() WHERE id=$1 AND status='driver_assigned'`,
      [rideId],
    );
    await this.app.db.query(
      `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) VALUES($1,'driver_assigned','driver_arriving',$2)`,
      [rideId, driverUserId],
    );
    this.app.realtime.publishRide(rideId, await this.get(rideId, driverUserId));
    const accepted = await this.driverRideDetail(rideId, driverUserId);
    const passenger = await this.app.db.query<{ passenger_id: string }>("SELECT passenger_id FROM rides WHERE id=$1", [rideId]);
    if (passenger.rows[0]) {
      await createNotification(this.app.db, {
        userId: passenger.rows[0].passenger_id,
        title: "Sürücün bulundu",
        body: "Sürücün yolculuğu kabul etti ve alış noktasına geliyor.",
        rideId,
      }).catch(() => undefined);
    }
    return accepted;
  }
  /**
   * Sürücü teklifi reddeder: teklif kapanır ve dağıtım motoru sıradaki sürücüye geçer.
   * Atanmış (eski akış) yolculuklarda atama kaldırılır.
   */
  async reject(rideId: string, driverUserId: string, reason?: string): Promise<{ status: RideStatus }> {
    const pending = await this.app.dispatch.pendingOffer(rideId);
    if (pending) {
      await this.app.dispatch.reject(rideId, driverUserId, reason ?? "driver_rejected");
      return { status: "searching" };
    }
    const current = await this.driverRideDetail(rideId, driverUserId);
    if (current.status !== "driver_assigned")
      throw new AppError(409, "RIDE_NOT_ASSIGNABLE", "Bu teklif artık geçerli değil.");
    await this.unassignRide(rideId, driverUserId, reason ?? "driver_rejected");
    await this.app.dispatch.pump(rideId);
    return { status: "searching" };
  }
  async messages(rideId: string, userId: string): Promise<RideMessage[]> {
    await this.get(rideId, userId);
    const result = await this.app.db.query<RideMessage>(
      `SELECT m.id,m.ride_id AS "rideId",r2.name AS "senderRole",
       (su.first_name||' '||su.last_name) AS "senderName",m.body,m.created_at AS "createdAt"
       FROM ride_messages m JOIN users su ON su.id=m.sender_id JOIN roles r2 ON r2.id=su.role
       WHERE m.ride_id=$1 ORDER BY m.created_at ASC LIMIT 100`,
      [rideId],
    );
    return result.rows;
  }
  async sendMessage(rideId: string, userId: string, body: string): Promise<RideMessage> {
    await this.get(rideId, userId);
    const result = await this.app.db.query<RideMessage>(
      `WITH inserted AS (
         INSERT INTO ride_messages(ride_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,ride_id,body,created_at
       )
       SELECT i.id,i.ride_id AS "rideId",r2.name AS "senderRole",
              (u.first_name||' '||u.last_name) AS "senderName",i.body,i.created_at AS "createdAt"
       FROM inserted i JOIN users u ON u.id=$2 JOIN roles r2 ON r2.id=u.role`,
      [rideId, userId, body],
    );
    const message = result.rows[0]!;
    this.app.realtime.publishRideMessage(rideId, message);
    return message;
  }
  /** Yolculuk sonrası karşılıklı puanlama; sürücü puanı yolcu oylarının ortalamasına yansır. */
  async rate(rideId: string, raterId: string, stars: number, comment?: string): Promise<{ rideId: string; stars: number }> {
    const ride = (await this.get(rideId, raterId)) as { status: RideStatus };
    if (ride.status !== "completed")
      throw new AppError(409, "RIDE_NOT_COMPLETED", "Puanlama yalnızca tamamlanan yolculuklarda yapılabilir.");
    const info = await this.app.db.query<{ role: "driver" | "passenger"; passengerId: string; driverUserId: string | null }>(
      `SELECT r2.name AS role, r.passenger_id AS "passengerId", d.user_id AS "driverUserId"
       FROM rides r JOIN users u ON u.id=$2 JOIN roles r2 ON r2.id=u.role
       LEFT JOIN drivers d ON d.id=r.driver_id WHERE r.id=$1`,
      [rideId, raterId],
    );
    const row = info.rows[0];
    if (!row) throw new AppError(404, "RIDE_NOT_FOUND", "Yolculuk bulunamadı.");
    const rateeId = row.role === "driver" ? row.passengerId : row.driverUserId;
    if (!rateeId) throw new AppError(409, "RATEE_NOT_FOUND", "Puanlanacak kullanıcı bulunamadı.");
    await this.app.db.query(
      `INSERT INTO ride_ratings(ride_id,rater_id,ratee_id,rater_role,stars,comment) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (ride_id,rater_id) DO UPDATE SET stars=EXCLUDED.stars,comment=EXCLUDED.comment,created_at=NOW()`,
      [rideId, raterId, rateeId, row.role, stars, comment ?? null],
    );
    if (row.role === "passenger") {
      await this.app.db.query(
        `UPDATE drivers SET rating=(SELECT COALESCE(ROUND(AVG(rr.stars)::numeric,2),5) FROM ride_ratings rr
           WHERE rr.ratee_id=$1 AND rr.rater_role='passenger'),updated_at=NOW() WHERE user_id=$1`,
        [raterId],
      );
    }
    return { rideId, stars };
  }
  /** Güvenli arama: karşı tarafın numarası maskeli gösterilir; gerçek numara yalnızca arama için verilir. */
  async contact(rideId: string, userId: string): Promise<RideContact> {
    await this.get(rideId, userId);
    const result = await this.app.db.query<{
      role: "driver" | "passenger";
      passengerName: string | null;
      passengerPhone: string | null;
      driverPhone: string | null;
    }>(
      `SELECT r2.name AS role, (pu.first_name||' '||pu.last_name) AS "passengerName", pu.phone AS "passengerPhone", du.phone AS "driverPhone"
       FROM rides r JOIN users u ON u.id=$2 JOIN roles r2 ON r2.id=u.role
       LEFT JOIN drivers d ON d.id=r.driver_id
       LEFT JOIN users pu ON pu.id=r.passenger_id LEFT JOIN users du ON du.id=d.user_id
       WHERE r.id=$1`,
      [rideId, userId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, "RIDE_NOT_FOUND", "Yolculuk bulunamadı.");
    const other = row.role === "driver" ? { phone: row.passengerPhone } : { phone: row.driverPhone };
    return {
      maskedPhone: maskPhone(other.phone),
      dialPhone: other.phone,
      passengerName: row.passengerName,
      safetyNotes: [
        "Numara karşı taraf için maskelenir; kişisel numaranı paylaşmadan ara.",
        "Güvenli arama kayıtları operasyon ekibi tarafından izlenir.",
        "Acil bir durumda 112'yi aramaktan çekinme.",
      ],
    };
  }
  /**
   * Faz 6: eşleştirme dağıtım motoruna devredildi. Bu uç, arama oturumunun
   * çalıştığını garanti eder ve güncel durumu döndürür; idempotenttir.
   */
  async match(id: string, passengerId: string) {
    const ride = (await this.get(id, passengerId)) as { status: RideStatus };
    if (ride.status !== "searching")
      return { matched: ride.status !== "cancelled", ride: await this.get(id, passengerId) };
    const status = await this.app.dispatch.start(id);
    return {
      matched: false,
      searching: true,
      dispatch: status,
      ride: await this.get(id, passengerId),
    };
  }
  async cancel(id: string, userId: string, reason: string, note?: string) {
    const ride = (await this.get(id, userId)) as { status: RideStatus };
    if (!transitions[ride.status].includes("cancelled"))
      throw new AppError(
        409,
        "INVALID_RIDE_STATUS",
        "Bu yolculuk iptal edilemez.",
      );
    const client = await this.app.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE rides SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [id],
      );
      await client.query(
        `INSERT INTO ride_cancellations(ride_id,cancelled_by,reason_code,note) VALUES($1,$2,$3,$4)`,
        [id, userId, reason, note ?? null],
      );
      await client.query(
        `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) VALUES($1,$2,'cancelled',$3)`,
        [id, ride.status, userId],
      );
      // İptal, sürücüyü dağıtıma geri döndürür.
      await client.query(
        `UPDATE drivers SET availability='available',online_status=TRUE,updated_at=NOW()
         WHERE id=(SELECT driver_id FROM rides WHERE id=$1)`,
        [id],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Faz 6: iptal, açık dağıtım aramasını ve bekleyen teklifleri kapatır.
    await this.app.dispatch.cancel(id, "ride_cancelled");
    const updated = await this.get(id, userId);
    this.app.realtime.publishRide(id, updated);
    const cancelledDriver = await this.app.db.query<{ user_id: string }>(
      `SELECT d.user_id FROM drivers d JOIN rides r ON r.driver_id=d.id WHERE r.id=$1`,
      [id],
    );
    if (cancelledDriver.rows[0]) {
      this.app.realtime.publishUser(cancelledDriver.rows[0].user_id, "driver.updated", {
        availability: "available",
        onlineStatus: true,
        releasedFrom: "ride_cancelled",
      });
      await this.app.locationService
        .syncAvailability(cancelledDriver.rows[0].user_id, "available")
        .catch(() => undefined);
    }
    this.app.realtime.publishDispatch("dispatch.ride", { rideId: id, status: "cancelled" });
    const passenger = await this.app.db.query<{ passenger_id: string }>("SELECT passenger_id FROM rides WHERE id=$1", [id]);
    if (passenger.rows[0]) {
      await createNotification(this.app.db, {
        userId: passenger.rows[0].passenger_id,
        title: "Yolculuk iptal edildi",
        body: "Yolculuk talebin iptal edildi. Yeni bir çağrı oluşturabilirsin.",
        rideId: id,
      }).catch(() => undefined);
    }
    return updated;
  }
  async updateDriverLocation(id: string, driverUserId: string, location: { latitude: number; longitude: number; heading?: number | undefined; accuracyMeters?: number | undefined }) {
    await this.get(id, driverUserId);
    await this.app.db.query(`INSERT INTO ride_locations(ride_id,location_type,latitude,longitude,heading,accuracy_meters) VALUES($1,'driver',$2,$3,$4,$5)`, [id, location.latitude, location.longitude, location.heading ?? null, location.accuracyMeters ?? null]);
    const update = { rideId: id, driverLocation: location };
    this.app.realtime.publishRide(id, update);
    return update;
  }
  async updateStatus(id: string, driverUserId: string, next: RideStatus) {
    const current = (await this.get(id, driverUserId)) as {
      status: RideStatus;
    };
    if (!transitions[current.status].includes(next) || next === "cancelled")
      throw new AppError(
        409,
        "INVALID_STATUS_TRANSITION",
        `${current.status} durumundan ${next} durumuna geçilemez.`,
      );
    await this.app.db.query(
      `UPDATE rides SET status=$2,updated_at=NOW(),started_at=CASE WHEN $3='started' THEN NOW() ELSE started_at END,completed_at=CASE WHEN $3='completed' THEN NOW() ELSE completed_at END WHERE id=$1`,
      [id, next, next],
    );
    if (next === "completed") {
      // Bu fazda tahsilat iç cüzdan defterinden düşülür; yetersiz bakiyede yolculuk yine tamamlanır.
      await this.app.db.query(`UPDATE ride_pricing SET final_fare=estimated_fare WHERE ride_id=$1`, [id]);
      await this.app.db.query(
        `UPDATE drivers SET total_rides=total_rides+1,availability='available',online_status=TRUE,updated_at=NOW()
         WHERE id=(SELECT driver_id FROM rides WHERE id=$1)`,
        [id],
      );
      const billed = await this.app.db.query<{ passenger_id: string; fare: number; destination: string }>(
        `SELECT r.passenger_id, COALESCE(p.final_fare, p.estimated_fare)::float8 AS fare, r.destination_address AS destination
         FROM rides r JOIN ride_pricing p ON p.ride_id=r.id WHERE r.id=$1`,
        [id],
      );
      const bill = billed.rows[0];
      if (bill) {
        await this.payments.chargeRide(bill.passenger_id, id, bill.fare, `${bill.destination} yolculuğu`).catch(() => undefined);
        await createNotification(this.app.db, {
          userId: bill.passenger_id,
          title: "Yolculuk tamamlandı",
          body: `${bill.destination} yolculuğun bitti. Ücret ₺${bill.fare.toFixed(2)}.`,
          rideId: id,
        }).catch(() => undefined);
      }
    }
    await this.app.db.query(
      `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) SELECT $1,$2,$3,u.id FROM drivers d JOIN users u ON u.id=d.user_id JOIN rides r ON r.driver_id=d.id WHERE r.id=$1 AND u.id=$4`,
      [id, current.status, next, driverUserId],
    );
    const updated = await this.get(id, driverUserId);
    this.app.realtime.publishRide(id, updated);
    if (next === "completed") {
      this.app.realtime.publishUser(driverUserId, "driver.updated", {
        availability: "available",
        onlineStatus: true,
        releasedFrom: "ride_completed",
      });
      await this.app.locationService.syncAvailability(driverUserId, "available").catch(() => undefined);
    } else {
      // Konum defterindeki yolculuk bağlantısı güncel kalsın.
      this.app.locationService.invalidate(driverUserId);
    }
    this.app.realtime.publishDispatch("dispatch.ride", { rideId: id, status: next });
    return updated;
  }

  private mapHistoryRow(row: Record<string, unknown>): RideHistoryItem {
    const pickupAddress = String(row.pickupAddress ?? "");
    const destinationAddress = String(row.destinationAddress ?? "");
    return {
      id: String(row.id),
      status: row.status as RideStatus,
      vehicleType: row.vehicleType as VehicleType,
      pickupAddress,
      destinationAddress,
      pickup: {
        latitude: Number(row.pickupLatitude ?? 0),
        longitude: Number(row.pickupLongitude ?? 0),
        address: pickupAddress,
      },
      destination: {
        latitude: Number(row.destinationLatitude ?? 0),
        longitude: Number(row.destinationLongitude ?? 0),
        address: destinationAddress,
      },
      distanceMeters: Number(row.distanceMeters ?? 0),
      durationSeconds: Number(row.durationSeconds ?? 0),
      estimatedFare: Number(row.estimatedFare ?? 0),
      finalFare: row.finalFare == null ? null : Number(row.finalFare),
      geometry: (row.geometry as RideHistoryItem["geometry"]) ?? null,
      driverName: (row.driverName as string | null) ?? null,
      vehicle: (row.vehicle as string | null) ?? null,
      plate: (row.plate as string | null) ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
      completedAt:
        row.completedAt == null
          ? null
          : row.completedAt instanceof Date
            ? row.completedAt.toISOString()
            : String(row.completedAt),
    };
  }
}
