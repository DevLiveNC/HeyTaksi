import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { z } from 'zod';
import { kktcPlaceById } from '@heytaksi/shared';
import { env } from '../../config/env.js';

/** Faz 5 demo verisi: doğrulanmış sürücü, yolcu ve kazanç/yoğunluk ekranlarını besleyen geçmiş yolculuklar. */
const input = z.object({
  DEMO_DRIVER_EMAIL: z.email().default('driver@heytaksi.com'),
  DEMO_DRIVER_PASSWORD: z.string().min(10).default('HeyTaksi2026'),
  DEMO_PASSENGER_EMAIL: z.email().default('passenger@heytaksi.com'),
  DEMO_PASSENGER_PASSWORD: z.string().min(10).default('HeyTaksi2026'),
}).parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();

interface SeedRide {
  hoursAgo: number;
  pickup: [number, number, string];
  destination: [number, number, string];
  distanceKm: number;
  durationMinutes: number;
  fare: number;
  waitSeconds: number;
  stars: number;
}

const asPoint = (id: string): [number, number, string] => {
  const place = kktcPlaceById(id);
  if (!place) throw new Error(`KKTC katalogunda ${id} yok`);
  return [place.latitude, place.longitude, place.address];
};

const routes: Array<[string, string]> = [
  ['dereboyu', 'lefkosa-hastane'],
  ['gonyeli', 'ydu'],
  ['girne-limani', 'bellapais'],
  ['gazimagusa-surici', 'salamis'],
  ['bandabuliya', 'kaymakli'],
];

const rideSeeds: SeedRide[] = [];
for (let index = 0; index < 16; index += 1) {
  const [pickupId, destinationId] = routes[index % routes.length]!;
  const pickup = asPoint(pickupId);
  const destination = asPoint(destinationId);
  const distanceKm = 3 + (index % 5) * 2.4;
  const durationMinutes = Math.round(8 + distanceKm * 2.2);
  rideSeeds.push({
    hoursAgo: index < 4 ? 3 - index * 0.7 : 20 + index * 17,
    pickup,
    destination,
    distanceKm,
    durationMinutes,
    fare: Math.round((45 + distanceKm * 18 + durationMinutes * 1.2) * (1 + (index % 3) * 0.1)),
    waitSeconds: 60 + (index % 4) * 95,
    stars: [5, 5, 4, 5, 4, 3][index % 6]!,
  });
}

try {
  await client.query('BEGIN');
  const passwordHash = await argon2.hash(input.DEMO_DRIVER_PASSWORD);
  const passengerHash = await argon2.hash(input.DEMO_PASSENGER_PASSWORD);

  const passenger = await client.query<{ id: string }>(
    `INSERT INTO users(email,phone,password_hash,first_name,last_name,role)
     SELECT $1,$2,$3,$4,$5,id FROM roles WHERE name='passenger'
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',is_active=TRUE,updated_at=NOW()
     RETURNING id`,
    [input.DEMO_PASSENGER_EMAIL.toLowerCase(), '+905551110022', passengerHash, 'Deniz', 'Yılmaz'],
  );
  const driver = await client.query<{ id: string }>(
    `INSERT INTO users(email,phone,password_hash,first_name,last_name,role)
     SELECT $1,$2,$3,$4,$5,id FROM roles WHERE name='driver'
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',is_active=TRUE,updated_at=NOW()
     RETURNING id`,
    [input.DEMO_DRIVER_EMAIL.toLowerCase(), '+905331110033', passwordHash, 'Kemal', 'Demir'],
  );
  const driverUserId = driver.rows[0]!.id;
  const passengerUserId = passenger.rows[0]!.id;
  await client.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [driverUserId]);
  await client.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [passengerUserId]);
  await client.query(
    `INSERT INTO drivers(user_id,driver_status,rating,total_rides,acceptance_rate,cancellation_rate,online_status,verification_status,availability)
     VALUES($1,'active',4.87,0,94,3,FALSE,'verified','offline')
     ON CONFLICT(user_id) DO UPDATE SET driver_status='active',verification_status='verified',rating=4.87,updated_at=NOW()`,
    [driverUserId],
  );
  const driverRow = await client.query<{ id: string }>('SELECT id FROM drivers WHERE user_id=$1', [driverUserId]);
  const driverId = driverRow.rows[0]!.id;
  await client.query(
    `INSERT INTO vehicles(driver_id,plate,brand,model,year,color,vehicle_type,status)
     VALUES($1,'HT400','Toyota','Corolla',2023,'Beyaz','standard','active')
     ON CONFLICT(plate) DO UPDATE SET driver_id=EXCLUDED.driver_id,status='active',updated_at=NOW()`,
    [driverId],
  );
  const vehicle = await client.query<{ id: string }>('SELECT id FROM vehicles WHERE driver_id=$1', [driverId]);

  // Demo yolculukları yeniden üret: eski demo kayıtları temizlenir.
  await client.query(
    `DELETE FROM rides WHERE passenger_id=$1 AND (
       pickup_address LIKE '%Mersin%' OR destination_address LIKE '%Mersin%'
       OR pickup_address LIKE '%Lefkoşa%' OR destination_address LIKE '%Lefkoşa%'
       OR pickup_address LIKE '%Girne%' OR pickup_address LIKE '%Gazimağusa%'
       OR pickup_address LIKE '%Gönyeli%' OR pickup_address LIKE '%Kaymaklı%'
     )`,
    [passengerUserId],
  );

  for (const seed of rideSeeds) {
    const requestedAt = new Date(Date.now() - seed.hoursAgo * 3_600_000);
    const arrivedAt = new Date(requestedAt.getTime() + 5 * 60_000);
    const startedAt = new Date(arrivedAt.getTime() + seed.waitSeconds * 1000);
    const completedAt = new Date(startedAt.getTime() + seed.durationMinutes * 60_000);
    const ride = await client.query<{ id: string }>(
      `INSERT INTO rides(passenger_id,driver_id,vehicle_id,status,vehicle_type,pickup_address,destination_address,
         requested_at,assigned_at,started_at,completed_at,created_at,updated_at)
       VALUES($1,$2,$3,'completed','standard',$4,$5,$6,$7,$8,$9,$6,$9) RETURNING id`,
      [passengerUserId, driverId, vehicle.rows[0]!.id, seed.pickup[2], seed.destination[2], requestedAt,
        new Date(requestedAt.getTime() + 30_000), startedAt, completedAt],
    );
    const rideId = ride.rows[0]!.id;
    await client.query(
      `INSERT INTO ride_locations(ride_id,location_type,latitude,longitude,address,recorded_at)
       VALUES($1,'pickup',$2,$3,$4,$6),($1,'destination',$5,$7,$8,$9)`,
      [rideId, seed.pickup[0], seed.pickup[1], seed.pickup[2], seed.destination[0], requestedAt, seed.destination[1], seed.destination[2], completedAt],
    );
    await client.query(
      `INSERT INTO ride_pricing(ride_id,distance_meters,duration_seconds,base_fare,distance_fare,time_fare,multiplier,estimated_fare,final_fare,route_geometry,created_at)
       VALUES($1,$2,$3,45,$4,$5,1,$6,$6,$7,$8)`,
      [rideId, Math.round(seed.distanceKm * 1000), seed.durationMinutes * 60,
        Math.round(seed.distanceKm * 18 * 100) / 100, Math.round(seed.durationMinutes * 1.2 * 100) / 100,
        seed.fare,
        JSON.stringify({ type: 'LineString', coordinates: [[seed.pickup[1], seed.pickup[0]], [seed.destination[1], seed.destination[0]]] }),
        completedAt],
    );
    await client.query(
      `INSERT INTO ride_status_history(ride_id,from_status,to_status,changed_by,created_at) VALUES
       ($1,NULL,'searching',$2,$3),($1,'searching','driver_assigned',$2,$4),($1,'driver_assigned','driver_arriving',$2,$4),
       ($1,'driver_arriving','driver_arrived',$2,$5),($1,'driver_arrived','started',$2,$6),
       ($1,'started','in_progress',$2,$6),($1,'in_progress','completed',$2,$7)`,
      [rideId, passengerUserId, requestedAt, new Date(requestedAt.getTime() + 30_000), arrivedAt, startedAt, completedAt],
    );
    await client.query(
      `INSERT INTO ride_ratings(ride_id,rater_id,ratee_id,rater_role,stars,created_at)
       VALUES($1,$2,$3,'passenger',$4,$5) ON CONFLICT (ride_id,rater_id) DO UPDATE SET stars=EXCLUDED.stars`,
      [rideId, passengerUserId, driverUserId, seed.stars, completedAt],
    );
  }
  await client.query(
    `UPDATE drivers SET total_rides=(SELECT COUNT(*) FROM rides WHERE driver_id=$1 AND status='completed'),
       rating=COALESCE((SELECT ROUND(AVG(rr.stars)::numeric,2) FROM ride_ratings rr WHERE rr.ratee_id=$2 AND rr.rater_role='passenger'),5)
     WHERE id=$1`,
    [driverId, driverUserId],
  );
  await client.query('COMMIT');
  console.info(`Demo hazır: sürücü ${input.DEMO_DRIVER_EMAIL} / ${input.DEMO_DRIVER_PASSWORD}, yolcu ${input.DEMO_PASSENGER_EMAIL} / ${input.DEMO_PASSENGER_PASSWORD}, ${rideSeeds.length} yolculuk.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
