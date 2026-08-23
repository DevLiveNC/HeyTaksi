import type { Pool } from 'pg';
import type { DeviceInput, Role, UserStatus } from '@heytaksi/shared';

export interface UserRecord {
  id: string; email: string | null; phone: string | null; password_hash: string | null;
  first_name: string; last_name: string; profile_image: string | null; role: Role;
  status: UserStatus; is_active: boolean; permissions: string[]; created_at: Date; updated_at: Date;
}
export interface RequestContext { ip: string; userAgent: string; }
export interface OtpRecord { id: string; code_hash: string; attempt_count: number; max_attempts: number; expires_at: Date; }

const userSelect = `
  SELECT u.id, u.email, u.phone, u.password_hash, u.first_name, u.last_name, u.profile_image,
    r.name AS role, u.status, u.is_active, u.created_at, u.updated_at,
    COALESCE(array_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '{}') AS permissions
  FROM users u JOIN roles r ON r.id = u.role
  LEFT JOIN role_permissions rp ON rp.role_id = r.id
  LEFT JOIN permissions p ON p.id = rp.permission_id`;
const groupUser = ' GROUP BY u.id, r.name';

export class AuthRepository {
  constructor(private readonly db: Pool) {}

  async findByEmail(email: string) { return this.find(`${userSelect} WHERE LOWER(u.email) = LOWER($1)${groupUser}`, [email]); }
  async findByPhone(phone: string) { return this.find(`${userSelect} WHERE u.phone = $1${groupUser}`, [phone]); }
  async findById(id: string) { return this.find(`${userSelect} WHERE u.id = $1${groupUser}`, [id]); }

  private async find(query: string, values: unknown[]): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>(query, values);
    return result.rows[0] ?? null;
  }

  async create(input: { email?: string; phone?: string; passwordHash?: string; firstName: string; lastName: string; role: Role }): Promise<UserRecord> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users(email, phone, password_hash, first_name, last_name, role)
         SELECT $1, $2, $3, $4, $5, id FROM roles WHERE name = $6 RETURNING id`,
        [input.email ?? null, input.phone ?? null, input.passwordHash ?? null, input.firstName, input.lastName, input.role],
      );
      const id = inserted.rows[0]!.id;
      await client.query('INSERT INTO user_profiles(user_id) VALUES ($1)', [id]);
      if (input.role === 'driver') await client.query('INSERT INTO drivers(user_id) VALUES ($1)', [id]);
      await client.query('COMMIT');
      return (await this.findById(id))!;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async upsertDevice(userId: string, device: DeviceInput, context: RequestContext) {
    await this.db.query(
      `INSERT INTO devices(id, user_id, name, platform, user_agent, last_ip)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET
       name=EXCLUDED.name, platform=EXCLUDED.platform, user_agent=EXCLUDED.user_agent,
       last_ip=EXCLUDED.last_ip, last_seen_at=NOW() WHERE devices.user_id=EXCLUDED.user_id`,
      [device.id, userId, device.name ?? null, device.platform, context.userAgent, context.ip],
    );
  }

  async createSession(input: { userId: string; deviceId: string; tokenHash: string; expiresAt: Date; context: RequestContext }) {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO user_sessions(user_id, device_id, refresh_token_hash, expires_at, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.userId, input.deviceId, input.tokenHash, input.expiresAt, input.context.ip, input.context.userAgent],
    );
    return result.rows[0]!.id;
  }

  async setSessionToken(sessionId: string, tokenHash: string) {
    await this.db.query('UPDATE user_sessions SET refresh_token_hash=$2 WHERE id=$1', [sessionId, tokenHash]);
  }

  async rotateSession(sessionId: string, tokenHash: string) {
    const result = await this.db.query<{ user_id: string; device_id: string }>(
      `UPDATE user_sessions SET revoked_at=NOW(), revoked_reason='rotated', last_used_at=NOW()
       WHERE id=$1 AND refresh_token_hash=$2 AND revoked_at IS NULL AND expires_at>NOW()
       RETURNING user_id, device_id`, [sessionId, tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async revokeSession(sessionId: string, userId: string, reason = 'logout') {
    const result = await this.db.query('UPDATE user_sessions SET revoked_at=NOW(), revoked_reason=$3 WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [sessionId, userId, reason]);
    return Boolean(result.rowCount);
  }

  async revokeAllSessions(userId: string, reason = 'logout_all') {
    await this.db.query('UPDATE user_sessions SET revoked_at=NOW(), revoked_reason=$2 WHERE user_id=$1 AND revoked_at IS NULL', [userId, reason]);
  }

  async listSessions(userId: string) {
    const result = await this.db.query(
      `SELECT s.id, s.device_id AS "deviceId", COALESCE(d.name, d.platform, 'Bilinmeyen cihaz') AS "deviceName",
       d.platform, s.ip_address AS "ipAddress", s.created_at AS "createdAt", s.last_used_at AS "lastUsedAt", s.expires_at AS "expiresAt"
       FROM user_sessions s LEFT JOIN devices d ON d.id=s.device_id
       WHERE s.user_id=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW() ORDER BY s.last_used_at DESC`, [userId],
    );
    return result.rows;
  }

  async recentOtpCount(phone: string) {
    const result = await this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM otp_codes WHERE phone=$1 AND created_at > NOW() - INTERVAL '10 minutes'", [phone]);
    return Number(result.rows[0]?.count ?? 0);
  }

  async saveOtp(input: { phone: string; purpose: string; codeHash: string; expiresAt: Date; ip: string }) {
    await this.db.query('UPDATE otp_codes SET consumed_at=NOW() WHERE phone=$1 AND purpose=$2 AND consumed_at IS NULL', [input.phone, input.purpose]);
    await this.db.query('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at,requested_ip) VALUES($1,$2,$3,$4,$5)', [input.phone, input.purpose, input.codeHash, input.expiresAt, input.ip]);
  }

  async findActiveOtp(phone: string, purpose: string): Promise<OtpRecord | null> {
    const result = await this.db.query<OtpRecord>(
      `SELECT id,code_hash,attempt_count,max_attempts,expires_at FROM otp_codes
       WHERE phone=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW()
       ORDER BY created_at DESC LIMIT 1`, [phone, purpose],
    );
    return result.rows[0] ?? null;
  }
  async failOtp(id: string) { await this.db.query('UPDATE otp_codes SET attempt_count=attempt_count+1, consumed_at=CASE WHEN attempt_count+1>=max_attempts THEN NOW() ELSE consumed_at END WHERE id=$1', [id]); }
  async consumeOtp(id: string) { return Boolean((await this.db.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL RETURNING id', [id])).rowCount); }

  async audit(input: { actorId?: string; action: string; entityType?: string; entityId?: string; context: RequestContext; metadata?: Record<string, unknown> }) {
    await this.db.query(
      'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [input.actorId ?? null, input.action, input.entityType ?? null, input.entityId ?? null, input.context.ip, input.context.userAgent, input.metadata ?? {}],
    );
  }
}
