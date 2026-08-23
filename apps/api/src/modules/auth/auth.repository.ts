import type { Pool } from 'pg';
import type { Role } from '@heytaksi/shared';

export interface UserRecord {
  id: string; email: string; password_hash: string; first_name: string; last_name: string; role: Role; is_active: boolean;
}

export class AuthRepository {
  constructor(private readonly db: Pool) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.db.query<UserRecord>('SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1', [email]);
    return result.rows[0] ?? null;
  }

  async create(input: { email: string; passwordHash: string; firstName: string; lastName: string; role: Role }): Promise<UserRecord> {
    const result = await this.db.query<UserRecord>(
      `INSERT INTO users(email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, password_hash, first_name, last_name, role, is_active`,
      [input.email, input.passwordHash, input.firstName, input.lastName, input.role],
    );
    return result.rows[0]!;
  }

  async saveRefreshSession(userId: string, tokenHash: string, expiresAt: Date) {
    await this.db.query('INSERT INTO refresh_sessions(user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt]);
  }

  async consumeRefreshSession(tokenHash: string) {
    const result = await this.db.query<{ user_id: string }>(
      `UPDATE refresh_sessions SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING user_id`, [tokenHash],
    );
    return result.rows[0] ?? null;
  }
}
