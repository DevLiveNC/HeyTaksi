import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { z } from 'zod';
import { DEFAULT_MAP_CENTER } from '@heytaksi/shared';
import { env } from '../../config/env.js';

/**
 * Tüm hesap türleri için demo hesaplar oluşturur.
 * Roller: passenger, driver, admin, dispatcher, support
 * 
 * Çalıştırma:
 *   npm run db:seed-all-demo
 * 
 * Her rol için bir demo hesap oluşturur, mevcutsa şifresini günceller.
 */

const inputSchema = z.object({
  // Passenger
  DEMO_PASSENGER_EMAIL: z.email().default('passenger.demo@heytaksi.com'),
  DEMO_PASSENGER_PASSWORD: z.string().min(10).default('PassengerDemo2026!'),
  DEMO_PASSENGER_PHONE: z.string().default('+905551110001'),
  // Driver
  DEMO_DRIVER_EMAIL: z.email().default('driver.demo@heytaksi.com'),
  DEMO_DRIVER_PASSWORD: z.string().min(10).default('DriverDemo2026!'),
  DEMO_DRIVER_PHONE: z.string().default('+905331110002'),
  // Admin
  DEMO_ADMIN_EMAIL: z.email().default('admin.demo@heytaksi.com'),
  DEMO_ADMIN_PASSWORD: z.string().min(10).default('AdminDemo2026!'),
  DEMO_ADMIN_PHONE: z.string().default('+905551110003'),
  // Dispatcher
  DEMO_DISPATCHER_EMAIL: z.email().default('dispatcher.demo@heytaksi.com'),
  DEMO_DISPATCHER_PASSWORD: z.string().min(10).default('DispatcherDemo2026!'),
  DEMO_DISPATCHER_PHONE: z.string().default('+905551110004'),
  // Support
  DEMO_SUPPORT_EMAIL: z.email().default('support.demo@heytaksi.com'),
  DEMO_SUPPORT_PASSWORD: z.string().min(10).default('SupportDemo2026!'),
  DEMO_SUPPORT_PHONE: z.string().default('+905551110005'),
});

const input = inputSchema.parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();

type DemoAccount = {
  role: string;
  email: string;
  password: string;
  phone: string;
  firstName: string;
  lastName: string;
  description: string;
};

const accounts: DemoAccount[] = [
  {
    role: 'passenger',
    email: input.DEMO_PASSENGER_EMAIL.toLowerCase(),
    password: input.DEMO_PASSENGER_PASSWORD,
    phone: input.DEMO_PASSENGER_PHONE,
    firstName: 'Demo',
    lastName: 'Yolcu',
    description: 'Yolcu uygulaması - yolculuk talep etme, cüzdan, profil',
  },
  {
    role: 'driver',
    email: input.DEMO_DRIVER_EMAIL.toLowerCase(),
    password: input.DEMO_DRIVER_PASSWORD,
    phone: input.DEMO_DRIVER_PHONE,
    firstName: 'Demo',
    lastName: 'Sürücü',
    description: 'Sürücü uygulaması - teklif kabul, navigasyon, kazanç',
  },
  {
    role: 'admin',
    email: input.DEMO_ADMIN_EMAIL.toLowerCase(),
    password: input.DEMO_ADMIN_PASSWORD,
    phone: input.DEMO_ADMIN_PHONE,
    firstName: 'Demo',
    lastName: 'Admin',
    description: 'Tam yetkili yönetici - tüm yönetim paneli erişimi',
  },
  {
    role: 'dispatcher',
    email: input.DEMO_DISPATCHER_EMAIL.toLowerCase(),
    password: input.DEMO_DISPATCHER_PASSWORD,
    phone: input.DEMO_DISPATCHER_PHONE,
    firstName: 'Demo',
    lastName: 'Dispatcher',
    description: 'Operasyon görevlisi - dispatch yönetimi',
  },
  {
    role: 'support',
    email: input.DEMO_SUPPORT_EMAIL.toLowerCase(),
    password: input.DEMO_SUPPORT_PASSWORD,
    phone: input.DEMO_SUPPORT_PHONE,
    firstName: 'Demo',
    lastName: 'Support',
    description: 'Destek görevlisi - destek kayıtları yönetimi',
  },
];

try {
  await client.query('BEGIN');

  for (const acc of accounts) {
    const passwordHash = await argon2.hash(acc.password);

    // Kullanıcıyı oluştur veya güncelle
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users(email, phone, password_hash, first_name, last_name, role, status, is_active)
       SELECT $1, $2, $3, $4, $5, id, 'active', TRUE FROM roles WHERE name = $6
       ON CONFLICT(email) DO UPDATE SET
         phone = EXCLUDED.phone,
         password_hash = EXCLUDED.password_hash,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         role = EXCLUDED.role,
         status = 'active',
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id`,
      [acc.email, acc.phone, passwordHash, acc.firstName, acc.lastName, acc.role],
    );

    // Telefon conflict olursa phone'u güncelleme denemesi
    let userId: string;
    if (userResult.rows.length === 0) {
      // Email conflict yok ama role bulunamadı gibi durum - fallback sorgu
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
        [acc.email],
      );
      if (existing.rows.length === 0) {
        throw new Error(`Kullanıcı oluşturulamadı: ${acc.email} - rol ${acc.role} bulunamadı`);
      }
      userId = existing.rows[0]!.id;
      await client.query(
        `UPDATE users SET phone=$2, password_hash=$3, first_name=$4, last_name=$5, role=(SELECT id FROM roles WHERE name=$6), status='active', is_active=TRUE, updated_at=NOW() WHERE id=$1`,
        [userId, acc.phone, passwordHash, acc.firstName, acc.lastName, acc.role],
      );
    } else {
      userId = userResult.rows[0]!.id;
    }

    // Profil oluştur
    await client.query(
      `INSERT INTO user_profiles(user_id, locale, metadata)
       VALUES($1, 'tr-TR', $2)
       ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW()`,
      [userId, JSON.stringify({ demo: true, role: acc.role })],
    );

    // Role özel tablolar
    if (acc.role === 'passenger') {
      await client.query(
        `INSERT INTO wallets(user_id, balance) VALUES($1, 420.50)
         ON CONFLICT(user_id) DO UPDATE SET balance = GREATEST(wallets.balance, 420.50), updated_at=NOW()`,
        [userId],
      );
      await client.query(
        `INSERT INTO payment_methods(user_id, brand, last4, holder_name, exp_month, exp_year, is_default)
         SELECT $1, 'visa', '2086', 'Demo Yolcu', 8, 2028, TRUE
         WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id=$1 AND last4='2086')`,
        [userId],
      );
      await client.query(
        `INSERT INTO wallet_transactions(user_id, type, amount, balance_after, description)
         SELECT $1, 'topup', 500, 500, 'Cüzdana yükleme'
         WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE user_id=$1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO user_notifications(user_id, title, body)
         SELECT $1, 'Hoş geldin', 'Hey Taksi hesabın güvenle hazırlandı.'
         WHERE NOT EXISTS (SELECT 1 FROM user_notifications WHERE user_id=$1)`,
        [userId],
      );
      await client.query(
        `INSERT INTO support_tickets(user_id, subject, message, status)
         SELECT $1, 'Demo destek kaydı', 'Bu kayıt yönetim panelindeki Destek sayfasını doldurmak için oluşturuldu.', 'open'
         WHERE NOT EXISTS (SELECT 1 FROM support_tickets WHERE user_id=$1)`,
        [userId],
      );
    }

    if (acc.role === 'driver') {
      await client.query(
        `INSERT INTO drivers(user_id, driver_status, rating, total_rides, acceptance_rate, cancellation_rate, online_status, verification_status, availability)
         VALUES($1, 'active', 4.92, 0, 96, 2, FALSE, 'verified', 'offline')
         ON CONFLICT(user_id) DO UPDATE SET
           driver_status='active',
           verification_status='verified',
           rating=4.92,
           acceptance_rate=96,
           cancellation_rate=2,
           updated_at=NOW()`,
        [userId],
      );
      const driverRow = await client.query<{ id: string }>('SELECT id FROM drivers WHERE user_id=$1', [userId]);
      const driverId = driverRow.rows[0]!.id;

      // Demo araç - plaka benzersiz olmalı, driver'a göre
      const plate = acc.role === 'driver' ? `34DEMO${accounts.indexOf(acc) + 1}` : `34DEMO${userId.slice(0, 2).toUpperCase()}`;
      // Daha deterministik plaka: driver.demo için 34DMO001
      const demoPlate = '34DMO001';
      await client.query(
        `INSERT INTO vehicles(driver_id, plate, brand, model, year, color, vehicle_type, status)
         VALUES($1, $2, 'Toyota', 'Corolla', 2023, 'Beyaz', 'standard', 'active')
         ON CONFLICT(plate) DO UPDATE SET driver_id=EXCLUDED.driver_id, status='active', updated_at=NOW()`,
        [driverId, demoPlate],
      );
      await client.query(
        `INSERT INTO driver_locations(driver_id, latitude, longitude, heading, availability, recorded_at)
         VALUES($1, $2, $3, 90, 'offline', NOW())
         ON CONFLICT (driver_id) DO UPDATE SET
           latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, recorded_at = NOW()`,
        [driverId, DEFAULT_MAP_CENTER.latitude, DEFAULT_MAP_CENTER.longitude],
      );
    }

    if (['admin', 'dispatcher', 'support'].includes(acc.role)) {
      const isSuperAdmin = acc.role === 'admin';
      const department = acc.role === 'admin' ? 'Yönetim' : acc.role === 'dispatcher' ? 'Operasyon' : 'Destek';
      const employeeCode = `${acc.role.toUpperCase()}-DEMO-001`;

      await client.query(
        `INSERT INTO admin_users(user_id, department, employee_code, is_super_admin)
         VALUES($1, $2, $3, $4)
         ON CONFLICT(user_id) DO UPDATE SET department=EXCLUDED.department, is_super_admin=EXCLUDED.is_super_admin`,
        [userId, department, employeeCode, isSuperAdmin],
      );

      // Employee code unique conflictini çöz
      await client.query(
        `UPDATE admin_users SET employee_code=$2 WHERE user_id=$1 AND employee_code != $2
         AND NOT EXISTS (SELECT 1 FROM admin_users WHERE employee_code=$2 AND user_id != $1)`,
        [userId, employeeCode],
      ).catch(() => {
        // ignore if conflict
      });
    }

    console.info(`✓ ${acc.role.padEnd(12)} hazır: ${acc.email}`);
  }

  await client.query('COMMIT');

  console.info('\n=== TÜM DEMO HESAPLAR BAŞARIYLA OLUŞTURULDU ===\n');
  for (const acc of accounts) {
    console.info(`${acc.role.toUpperCase()}:\n  Email: ${acc.email}\n  Şifre: ${acc.password}\n  Telefon: ${acc.phone}\n  Ad Soyad: ${acc.firstName} ${acc.lastName}\n  Açıklama: ${acc.description}\n`);
  }
  console.info('Not: Tüm hesaplar aktif durumda ve giriş yapabilir.');
  console.info('Login endpoint: POST /api/v1/auth/login');
  console.info('Örnek body: { \"email\": \"...\", \"password\": \"...\", \"device\": { \"id\": \"6ba7b810-9dad-41d1-80b4-00c04fd430c8\", \"platform\": \"web\" } }');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Demo hesap oluşturma hatası:', error);
  throw error;
} finally {
  client.release();
  await pool.end();
}
