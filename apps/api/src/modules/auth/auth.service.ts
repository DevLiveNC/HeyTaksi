import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { LoginInput, RegisterInput, UserIdentity } from '@heytaksi/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { AuthRepository, type UserRecord } from './auth.repository.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const publicUser = (user: UserRecord): UserIdentity => ({ id: user.id, email: user.email, role: user.role });

export class AuthService {
  private readonly repository: AuthRepository;
  constructor(private readonly app: FastifyInstance) { this.repository = new AuthRepository(app.db); }

  async register(input: RegisterInput) {
    if (await this.repository.findByEmail(input.email)) throw AppError.conflict('Bu e-posta adresi zaten kullanılıyor.');
    const user = await this.repository.create({ ...input, passwordHash: await argon2.hash(input.password) });
    return this.createSession(user);
  }

  async login(input: LoginInput) {
    const user = await this.repository.findByEmail(input.email);
    if (!user || !user.is_active || !(await argon2.verify(user.password_hash, input.password))) {
      throw AppError.unauthorized('E-posta veya şifre hatalı.');
    }
    return this.createSession(user);
  }

  async refresh(token: string) {
    let payload: UserIdentity & { tokenType: 'refresh' };
    try { payload = this.app.jwt.verify(token, { key: env.JWT_REFRESH_SECRET }) as typeof payload; }
    catch { throw AppError.unauthorized('Yenileme anahtarı geçersiz.'); }
    if (payload.tokenType !== 'refresh' || !(await this.repository.consumeRefreshSession(hashToken(token)))) {
      throw AppError.unauthorized('Yenileme oturumu geçersiz veya kullanılmış.');
    }
    const user = await this.repository.findByEmail(payload.email);
    if (!user || !user.is_active) throw AppError.unauthorized();
    return this.createSession(user);
  }

  private async createSession(user: UserRecord) {
    const identity = publicUser(user);
    const accessToken = this.app.jwt.sign({ ...identity, tokenType: 'access' }, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
    const refreshToken = this.app.jwt.sign({ ...identity, tokenType: 'refresh' }, { key: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_EXPIRES_IN });
    await this.repository.saveRefreshSession(user.id, hashToken(refreshToken), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    return { user: identity, accessToken, refreshToken };
  }
}
