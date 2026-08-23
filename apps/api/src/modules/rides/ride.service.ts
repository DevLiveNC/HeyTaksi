import type {
  CreateRideInput,
  RideStatus,
  VehicleType,
} from "@heytaksi/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../core/errors/app-error.js";
import { MapService } from "../locations/map.service.js";
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
    const result = await this.app.db.query<{ id: string }>(
      `SELECT id FROM rides WHERE passenger_id=$1 AND status NOT IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 1`,
      [passengerId],
    );
    return result.rows[0] ? this.get(result.rows[0].id, passengerId) : null;
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
      }>(
        `SELECT d.id driver_id,v.id vehicle_id FROM drivers d JOIN vehicles v ON v.driver_id=d.id WHERE d.online_status=TRUE AND d.verification_status='verified' AND d.driver_status='active' AND v.status='active' AND v.vehicle_type=$1 AND NOT EXISTS(SELECT 1 FROM rides r WHERE r.driver_id=d.id AND r.status NOT IN ('completed','cancelled')) ORDER BY d.rating DESC,d.total_rides DESC LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
        [ride.rows[0].vehicle_type],
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
        `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) VALUES($1,'searching','driver_assigned',$2)`,
        [id, passengerId],
      );
      await client.query("COMMIT");
      const updated = await this.get(id, passengerId);
      this.app.realtime.publishRide(id, updated);
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
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const updated = await this.get(id, userId);
    this.app.realtime.publishRide(id, updated);
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
      `UPDATE rides SET status=$2,updated_at=NOW(),started_at=CASE WHEN $2='started' THEN NOW() ELSE started_at END,completed_at=CASE WHEN $2='completed' THEN NOW() ELSE completed_at END WHERE id=$1`,
      [id, next],
    );
    await this.app.db.query(
      `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by) SELECT $1,$2,$3,u.id FROM drivers d JOIN users u ON u.id=d.user_id JOIN rides r ON r.driver_id=d.id WHERE r.id=$1 AND u.id=$4`,
      [id, current.status, next, driverUserId],
    );
    const updated = await this.get(id, driverUserId);
    this.app.realtime.publishRide(id, updated);
    return updated;
  }
}
