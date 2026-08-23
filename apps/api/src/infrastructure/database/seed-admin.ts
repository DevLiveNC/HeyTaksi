import 'dotenv/config';
import argon2 from 'argon2';
import pg from 'pg';
import { z } from 'zod';
import { env } from '../../config/env.js';

const input = z.object({
  ADMIN_EMAIL: z.email(), ADMIN_PASSWORD: z.string().min(12),
  ADMIN_FIRST_NAME: z.string().min(2).default('Hey Taksi'), ADMIN_LAST_NAME: z.string().min(2).default('Admin'),
}).parse(process.env);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const passwordHash = await argon2.hash(input.ADMIN_PASSWORD);
  const result = await client.query<{ id: string }>(
    `INSERT INTO users(email,password_hash,first_name,last_name,role)
     SELECT $1,$2,$3,$4,id FROM roles WHERE name='admin'
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,status='active',is_active=TRUE,updated_at=NOW()
     RETURNING id`, [input.ADMIN_EMAIL.toLowerCase(),passwordHash,input.ADMIN_FIRST_NAME,input.ADMIN_LAST_NAME],
  );
  const id = result.rows[0]!.id;
  await client.query('INSERT INTO user_profiles(user_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
  await client.query('INSERT INTO admin_users(user_id,is_super_admin) VALUES($1,TRUE) ON CONFLICT(user_id) DO UPDATE SET is_super_admin=TRUE', [id]);
  await client.query('COMMIT');
  console.info(`Admin hazırlandı: ${input.ADMIN_EMAIL}`);
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
