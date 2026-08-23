import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { LoginInput, OtpRequestInput, OtpVerifyInput, RegisterInput, UserIdentity } from '@heytaksi/shared';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { AuthRepository, type RequestContext, type UserRecord } from './auth.repository.js';
import { OtpSender } from './otp.sender.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const hashOtp = (phone: string, code: string) => createHmac('sha256', env.OTP_SECRET).update(`${phone}:${code}`).digest('hex');
const secureEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};
const publicUser = (user: UserRecord): UserIdentity => ({ id: user.id, email: user.email, phone: user.phone, role: user.role, permissions: user.permissions });

export class AuthService {
  private readonly repository: AuthRepository;
  private readonly otpSender: OtpSender;
  constructor(private readonly app: FastifyInstance) {
    this.repository = new AuthRepository(app.db);
    this.otpSender = new OtpSender(app.log);
  }

  async register(input: RegisterInput, context: RequestContext) {
    if (await this.repository.findByEmail(input.email)) throw AppError.conflict('Bu e-posta adresi zaten kullanılıyor.');
    if (input.phone && await this.repository.findByPhone(input.phone)) throw AppError.conflict('Bu telefon numarası zaten kullanılıyor.');
    const user = await this.repository.create({
      email: input.email, ...(input.phone ? { phone: input.phone } : {}), passwordHash: await argon2.hash(input.password),
      firstName: input.firstName, lastName: input.lastName, role: input.role,
    });
    await this.repository.audit({ actorId: user.id, action: 'auth.register', entityType: 'user', entityId: user.id, context, metadata: { method: 'email' } });
    return this.createSession(user, input.device, context);
  }

  async login(input: LoginInput, context: RequestContext) {
    const user = await this.repository.findByEmail(input.email);
    if (!user || !user.password_hash || !this.isActive(user) || !(await argon2.verify(user.password_hash, input.password))) {
      await this.repository.audit({ action: 'auth.login_failed', context, metadata: { method: 'email' } });
      throw AppError.unauthorized('E-posta veya şifre hatalı.');
    }
    await this.repository.audit({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, context, metadata: { method: 'email' } });
    return this.createSession(user, input.device, context);
  }

  async requestOtp(input: OtpRequestInput, context: RequestContext) {
    if (await this.repository.recentOtpCount(input.phone) >= 3) throw new AppError(429, 'OTP_RATE_LIMIT', 'Çok fazla kod istendi. Lütfen 10 dakika sonra tekrar deneyin.');
    const user = await this.repository.findByPhone(input.phone);
    if (input.purpose === 'login' && !user) throw new AppError(404, 'USER_NOT_FOUND', 'Bu telefon numarasıyla kayıtlı kullanıcı bulunamadı.');
    if (input.purpose === 'register' && user) throw AppError.conflict('Bu telefon numarası zaten kayıtlı.');
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.repository.saveOtp({ phone: input.phone, purpose: input.purpose, codeHash: hashOtp(input.phone, code), expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000), ip: context.ip });
    await this.otpSender.send(input.phone, code);
    await this.repository.audit({ action: 'auth.otp_requested', context, metadata: { purpose: input.purpose } });
    return { expiresInSeconds: env.OTP_TTL_MINUTES * 60, ...(env.OTP_EXPOSE_CODE && env.NODE_ENV !== 'production' ? { debugCode: code } : {}) };
  }

  async verifyOtp(input: OtpVerifyInput, context: RequestContext) {
    const otp = await this.repository.findActiveOtp(input.phone, input.purpose);
    if (!otp || otp.attempt_count >= otp.max_attempts) throw AppError.unauthorized('Kod geçersiz veya süresi dolmuş.');
    if (!secureEqual(hashOtp(input.phone, input.code), otp.code_hash)) {
      await this.repository.failOtp(otp.id);
      await this.repository.audit({ action: 'auth.otp_failed', context, metadata: { purpose: input.purpose } });
      throw AppError.unauthorized('Kod geçersiz veya süresi dolmuş.');
    }
    if (!(await this.repository.consumeOtp(otp.id))) throw AppError.unauthorized('Kod daha önce kullanılmış.');

    let user = await this.repository.findByPhone(input.phone);
    if (input.purpose === 'register') {
      if (user) throw AppError.conflict('Bu telefon numarası zaten kayıtlı.');
      if (!input.firstName || !input.lastName) throw new AppError(422, 'PROFILE_REQUIRED', 'Kayıt için ad ve soyad gereklidir.');
      user = await this.repository.create({ phone: input.phone, firstName: input.firstName, lastName: input.lastName, role: input.role });
    }
    if (!user || !this.isActive(user)) throw AppError.unauthorized();
    await this.repository.audit({ actorId: user.id, action: 'auth.otp_verified', entityType: 'user', entityId: user.id, context, metadata: { purpose: input.purpose } });
    return this.createSession(user, input.device, context);
  }

  async refresh(token: string, context: RequestContext) {
    let payload: UserIdentity & { tokenType: 'refresh'; sid: string; did: string };
    try { payload = this.app.jwt.verify(token, { key: env.JWT_REFRESH_SECRET }) as typeof payload; }
    catch { throw AppError.unauthorized('Yenileme anahtarı geçersiz.'); }
    if (payload.tokenType !== 'refresh' || !(await this.repository.rotateSession(payload.sid, hashToken(token)))) {
      await this.repository.audit({ actorId: payload.id, action: 'auth.refresh_reuse', context });
      throw AppError.unauthorized('Yenileme oturumu geçersiz veya kullanılmış.');
    }
    const user = await this.repository.findById(payload.id);
    if (!user || !this.isActive(user)) throw AppError.unauthorized();
    await this.repository.audit({ actorId: user.id, action: 'auth.token_rotated', entityType: 'session', entityId: payload.sid, context });
    return this.createSessionForDevice(user, payload.did, context);
  }

  async logout(userId: string, sessionId: string, context: RequestContext, all = false) {
    if (all) await this.repository.revokeAllSessions(userId);
    else await this.repository.revokeSession(sessionId, userId);
    await this.repository.audit({ actorId: userId, action: all ? 'auth.logout_all' : 'auth.logout', entityType: 'session', entityId: sessionId, context });
  }

  listSessions(userId: string) { return this.repository.listSessions(userId); }
  revokeSession(userId: string, sessionId: string) { return this.repository.revokeSession(sessionId, userId, 'user_revoked'); }

  private async createSession(user: UserRecord, device: LoginInput['device'], context: RequestContext) {
    await this.repository.upsertDevice(user.id, device, context);
    return this.createSessionForDevice(user, device.id, context);
  }

  private async createSessionForDevice(user: UserRecord, deviceId: string, context: RequestContext) {
    const identity = publicUser(user);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
    const sessionId = await this.repository.createSession({ userId: user.id, deviceId, tokenHash: `pending:${crypto.randomUUID()}`, expiresAt, context });
    const claims = { ...identity, sid: sessionId, did: deviceId };
    const accessToken = this.app.jwt.sign({ ...claims, tokenType: 'access' }, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
    const refreshToken = this.app.jwt.sign({ ...claims, tokenType: 'refresh' }, { key: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_EXPIRES_IN });
    await this.repository.setSessionToken(sessionId, hashToken(refreshToken));
    return { user: identity, accessToken, refreshToken, expiresAt: expiresAt.toISOString() };
  }

  private isActive(user: UserRecord) { return user.is_active && user.status === 'active'; }
}
