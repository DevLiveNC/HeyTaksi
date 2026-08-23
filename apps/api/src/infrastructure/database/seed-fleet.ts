import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { z } from 'zod';
import { env } from '../../config/env.js';

/**
 * Faz 6 demo filosu: dağıtım sıralamasını ve canlı haritayı gözlemlenebilir kılan
 * çoklu sürücü verisi. Sürücüler farklı mesafe, puan, kabul ve iptal oranlarına sahiptir;
 * böylece deterministik skorun etkisi panelde görülebilir.
 */
const input = z
  .object({
    DEMO_FLEET_PASSWORD: z.string().min(10).default('FleetDemo2026!'),
    DEMO_FLEET_CENTER_LAT: z.coerce.number().default(36.8121),
    DEMO_FLEET_CENTER_LON: z.coerce.number().default(34.6415),
  })
  .parse(process.env);

interface FleetDriver {
  slug: string;
  firstName: string;
  lastName: string;
  phone: string;
  plate: string;
  brand: string;
  model: string;
  color: string;
  vehicleType: 'standard' | 'comfort' | 'xl' | 'accessible';
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  totalRides: number;
  /** Merkeze göre konum kayması (derece). */
  offset: [number, number];
  availability: 'online' | 'available' | 'paused';
}

const fleet: FleetDriver[] = [
  { slug: 'ayse', firstName: 'Ayşe', lastName: 'Kaya', phone: '+905331110101', plate: '33HT0101', brand: 'Toyota', model: 'Corolla', color: 'Beyaz', vehicleType: 'standard', rating: 4.92, acceptanceRate: 96, cancellationRate: 2, totalRides: 1840, offset: [0.004, 0.003], availability: 'online' },
  { slug: 'mehmet', firstName: 'Mehmet', lastName: 'Aydın', phone: '+905331110102', plate: '33HT0102', brand: 'Renault', model: 'Megane', color: 'Gri', vehicleType: 'standard', rating: 4.61, acceptanceRate: 78, cancellationRate: 9, totalRides: 920, offset: [-0.006, 0.005], availability: 'online' },
  { slug: 'zeynep', firstName: 'Zeynep', lastName: 'Demirci', phone: '+905331110103', plate: '33HT0103', brand: 'Volkswagen', model: 'Passat', color: 'Siyah', vehicleType: 'comfort', rating: 4.88, acceptanceRate: 91, cancellationRate: 4, totalRides: 1310, offset: [0.009, -0.007], availability: 'online' },
  { slug: 'hasan', firstName: 'Hasan', lastName: 'Yıldız', phone: '+905331110104', plate: '33HT0104', brand: 'Ford', model: 'Tourneo', color: 'Lacivert', vehicleType: 'xl', rating: 4.74, acceptanceRate: 88, cancellationRate: 6, totalRides: 640, offset: [-0.012, -0.004], availability: 'online' },
  { slug: 'elif', firstName: 'Elif', lastName: 'Şahin', phone: '+905331110105', plate: '33HT0105', brand: 'Fiat', model: 'Doblo', color: 'Beyaz', vehicleType: 'accessible', rating: 4.95, acceptanceRate: 97, cancellationRate: 1, totalRides: 410, offset: [0.014, 0.011], availability: 'online' },
  { slug: 'burak', firstName: 'Burak', lastName: 'Öztürk', phone: '+905331110106', plate: '33HT0106', brand: 'Hyundai', model: 'i20', color: 'Kırmızı', vehicleType: 'standard', rating: 4.35, acceptanceRate: 64, cancellationRate: 14, totalRides: 280, offset: [0.002, -0.009], availability: 'online' },
  { slug: 'canan', firstName: 'Canan', lastName: 'Arslan', phone: '+905331110107', plate: '33HT0107', brand: 'Skoda', model: 'Superb', color: 'Gümüş', vehicleType: 'comfort', rating: 4.79, acceptanceRate: 85, cancellationRate: 5, totalRides: 1120, offset: [-0.017, 0.013], availability: 'paused' },
  { slug: 'okan', firstName: 'Okan', lastName: 'Çelik', phone: '+905331110108', plate: '33HT0108', brand: 'Peugeot', model: '301', color: 'Beyaz', vehicleType: 'standard', rating: 4.68, acceptanceRate: 82, cancellationRate: 7, totalRides: 760, offset: [0.021, -0.016], availability: 'online' },
];

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');
  const passwordHash = await argon2.hash(input.DEMO_FLEET_PASSWORD);
  for (const member of fleet) {
    const email = `${member.slug}.driver@heytaksi.com`;
    const user = await client.query<{ id: string }>(
      `INSERT INTO users(email,phone,password_hash,first_name,last_name,role,status,is_active)
       SELECT $1,$2,$3,$4,$5,id,'active',TRUE FROM roles WHERE name='driver'
       ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,status='active',is_active=TRUE,updated_at=NOW()
       RETURNING id`,
      [email, member.phone, passwordHash, member.firstName, member.lastName],
    );
    const userId = user.rows[0]!.id;
    await client.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [userId]);
    const driver = await client.query<{ id: string }>(
      `INSERT INTO drivers(user_id,driver_status,rating,total_rides,acceptance_rate,cancellation_rate,online_status,verification_status,availability)
       VALUES($1,'active',$2,$3,$4,$5,TRUE,'verified',$6)
       ON CONFLICT(user_id) DO UPDATE SET driver_status='active',verification_status='verified',
         rating=EXCLUDED.rating,total_rides=EXCLUDED.total_rides,acceptance_rate=EXCLUDED.acceptance_rate,
         cancellation_rate=EXCLUDED.cancellation_rate,online_status=TRUE,availability=EXCLUDED.availability,updated_at=NOW()
       RETURNING id`,
      [userId, member.rating, member.totalRides, member.acceptanceRate, member.cancellationRate, member.availability],
    );
    const driverId = driver.rows[0]!.id;
    await client.query(
      `INSERT INTO vehicles(driver_id,plate,brand,model,year,color,vehicle_type,status)
       VALUES($1,$2,$3,$4,2022,$5,$6,'active')
       ON CONFLICT(plate) DO UPDATE SET driver_id=EXCLUDED.driver_id,status='active',
         vehicle_type=EXCLUDED.vehicle_type,updated_at=NOW()`,
      [driverId, member.plate, member.brand, member.model, member.color, member.vehicleType],
    );
    // Konum defteri: API ilk sinyale kadar bu kaydı fallback olarak kullanır.
    await client.query(
      `INSERT INTO driver_locations(driver_id,latitude,longitude,heading,availability,recorded_at)
       VALUES($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (driver_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
         availability=EXCLUDED.availability,recorded_at=NOW()`,
      [
        driverId,
        input.DEMO_FLEET_CENTER_LAT + member.offset[0],
        input.DEMO_FLEET_CENTER_LON + member.offset[1],
        Math.round(Math.abs((member.offset[0] * 3600) % 360)),
        member.availability,
      ],
    );
  }
  await client.query('COMMIT');
  console.info(
    `Demo filo hazır: ${fleet.length} sürücü (şifre: ${input.DEMO_FLEET_PASSWORD}).\n` +
      fleet.map((m) => `  ${m.slug}.driver@heytaksi.com — ${m.vehicleType}, puan ${m.rating}, kabul %${m.acceptanceRate}`).join('\n'),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
