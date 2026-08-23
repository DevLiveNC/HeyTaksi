import type {
  CreateRideInput,
  DriverRideDetail,
  RideContact,
  RideMessage,
  RideStatus,
  VehicleType,
} from "@heytaksi/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../core/errors/app-error.js";
import { OFFER_TTL_SECONDS } from "../drivers/driver.service.js";
import { MapService } from "../locations/map.service.js";
import { maskPhone } from "../../core/utils/phone.js";
const multipliers: Record<VehicleType, number> = {
  standard: 1,
  comfort: 1.35,
  xl: 1.6,
  accessible: 1.15,
};
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
  constructor(private app: FastifyInstance) {}
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
      `SELECT r.id,r.status,r.vehicle_type AS "vehicleType",r.pickup_address AS "pickupAddress",r.destination_address AS "destinationAddress",r.created_at AS "createdAt",p.distance_meters AS "distanceMeters",p.duration_seconds AS "durationSeconds",p.estimated_fare AS "estimatedFare",p.final_fare AS "finalFare",p.route_geometry AS geometry,u.first_name||' '||u.last_name AS "driverName",v.plate,v.brand||' '||v.model AS vehicle FROM rides r JOIN ride_pricing p ON p.ride_id=r.id LEFT JOIN drivers d ON d.id=r.driver_id LEFT JOIN users u ON u.id=d.user_id LEFT JOIN vehicles v ON v.id=r.vehicle_id WHERE r.id=$1 AND (r.passenger_id=$2 OR d.user_id=$2)`,
      [id, userId],
    );
    if (!result.rows[0])
      throw new AppError(404, "RIDE_NOT_FOUND", "Yolculuk bulunamadı.");
    return result.rows[0];
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
    const result = await this.app.db.query<{ id: string }>(
      `SELECT r.id FROM rides r JOIN drivers d ON d.id=r.driver_id
       WHERE d.user_id=$1 AND r.status NOT IN ('completed','cancelled')
       ORDER BY r.created_at DESC LIMIT 1`,
      [driverUserId],
    );
    return result.rows[0] ? this.driverRideDetail(result.rows[0].id, driverUserId) : null;
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
    const params: unknown[] = [OFFER_TTL_SECONDS];
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
  }
  /** Sürücü teklifi kabul eder: driver_assigned → driver_arriving. */
  async accept(rideId: string, driverUserId: string): Promise<DriverRideDetail> {
    await this.releaseStaleAssignments(driverUserId);
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
    return this.driverRideDetail(rideId, driverUserId);
  }
  /** Sürücü teklifi reddeder: yolculuk aramaya döner, sürücü yeniden dağıtıma açılır. */
  async reject(rideId: string, driverUserId: string, reason?: string): Promise<{ status: RideStatus }> {
    const current = await this.driverRideDetail(rideId, driverUserId);
    if (current.status !== "driver_assigned")
      throw new AppError(409, "RIDE_NOT_ASSIGNABLE", "Bu teklif artık geçerli değil.");
    await this.unassignRide(rideId, driverUserId, reason ?? "driver_rejected");
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
  async match(id: string, passengerId: string) {
    const client = await this.app.db.connect();
    try {
      await client.query("BEGIN");
      const ride = await client.query<{
        status: RideStatus;
        vehicle_type: string;
      }>(
        "SELECT status,vehicle_type FROM rides WHERE id=$1 AND passenger_id=$2 FOR UPDATE",
        [id, passengerId],
      );
      if (!ride.rows[0] || ride.rows[0].status !== "searching")
        throw new AppError(
          409,
          "RIDE_NOT_SEARCHING",
          "Yolculuk artık arama durumunda değil.",
        );
      const candidate = await client.query<{
        driver_id: string;
        vehicle_id: string;
        driver_user_id: string;
      }>(
        `SELECT d.id AS driver_id, dv.id AS vehicle_id, d.user_id AS driver_user_id
         FROM drivers d
         JOIN LATERAL (
           SELECT v.id FROM vehicles v
           WHERE v.driver_id=d.id AND v.status='active' AND v.vehicle_type=$1
           ORDER BY v.created_at DESC LIMIT 1
         ) dv ON TRUE
         WHERE d.availability IN ('online','available') AND d.verification_status='verified' AND d.driver_status='active'
           AND NOT EXISTS(SELECT 1 FROM rides r WHERE r.driver_id=d.id AND r.status NOT IN ('completed','cancelled'))
           AND NOT EXISTS(SELECT 1 FROM ride_rejections rr WHERE rr.ride_id=$2 AND rr.driver_id=d.id)
         ORDER BY d.rating DESC,d.total_rides DESC LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
        [ride.rows[0].vehicle_type, id],
      );
      if (!candidate.rows[0]) {
        await client.query("COMMIT");
        return { matched: false, ride: await this.get(id, passengerId) };
      }
      const c = candidate.rows[0];
      await client.query(
        `UPDATE rides SET driver_id=$2,vehicle_id=$3,status='driver_assigned',assigned_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [id, c.driver_id, c.vehicle_id],
      );
      await client.query(
        `UPDATE drivers SET availability='on_trip',updated_at=NOW() WHERE id=$1`,
        [c.driver_id],
      );
      await client.query(
        `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) VALUES($1,'searching','driver_assigned',$2)`,
        [id, passengerId],
      );
      await client.query("COMMIT");
      const updated = await this.get(id, passengerId);
      this.app.realtime.publishRide(id, updated);
      // Sürücüye teklif bildirimi: kullanıcı kanalından `ride.offer` gönderilir.
      this.app.realtime.publishUser(c.driver_user_id, "ride.offer", {
        ride: await this.driverRideDetail(id, c.driver_user_id),
        expiresAt: new Date(Date.now() + OFFER_TTL_SECONDS * 1000).toISOString(),
      });
      this.app.realtime.publishUser(c.driver_user_id, "driver.updated", {
        availability: "on_trip",
        onlineStatus: true,
      });
      return { matched: true, ride: updated };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
    const updated = await this.get(id, userId);
    this.app.realtime.publishRide(id, updated);
    const cancelledDriver = await this.app.db.query<{ user_id: string }>(
      `SELECT d.user_id FROM drivers d JOIN rides r ON r.driver_id=d.id WHERE r.id=$1`,
      [id],
    );
    if (cancelledDriver.rows[0])
      this.app.realtime.publishUser(cancelledDriver.rows[0].user_id, "driver.updated", {
        availability: "available",
        onlineStatus: true,
        releasedFrom: "ride_cancelled",
      });
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
      // Bu fazda tahsilat yok; sözleşme bedeli tahmini ücretle kesinleşir.
      await this.app.db.query(`UPDATE ride_pricing SET final_fare=estimated_fare WHERE ride_id=$1`, [id]);
      await this.app.db.query(
        `UPDATE drivers SET total_rides=total_rides+1,availability='available',online_status=TRUE,updated_at=NOW()
         WHERE id=(SELECT driver_id FROM rides WHERE id=$1)`,
        [id],
      );
    }
    await this.app.db.query(
      `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) SELECT $1,$2,$3,u.id FROM drivers d JOIN users u ON u.id=d.user_id JOIN rides r ON r.driver_id=d.id WHERE r.id=$1 AND u.id=$4`,
      [id, current.status, next, driverUserId],
    );
    const updated = await this.get(id, driverUserId);
    this.app.realtime.publishRide(id, updated);
    if (next === "completed")
      this.app.realtime.publishUser(driverUserId, "driver.updated", {
        availability: "available",
        onlineStatus: true,
        releasedFrom: "ride_completed",
      });
    return updated;
  }
}
