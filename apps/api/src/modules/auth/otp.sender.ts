import type { FastifyBaseLogger } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';

export class OtpSender {
  constructor(private readonly logger: FastifyBaseLogger) {}
  async send(phone: string, code: string) {
    if (!env.OTP_PROVIDER_WEBHOOK_URL) {
      if (env.NODE_ENV === 'production') throw new AppError(503, 'OTP_PROVIDER_UNAVAILABLE', 'SMS servisi şu anda kullanılamıyor.');
      this.logger.info({ phone: `***${phone.slice(-4)}`, code }, 'Geliştirme OTP kodu');
      return;
    }
    const response = await fetch(env.OTP_PROVIDER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(env.OTP_PROVIDER_API_KEY ? { authorization: `Bearer ${env.OTP_PROVIDER_API_KEY}` } : {}) },
      body: JSON.stringify({ phone, code, ttlSeconds: env.OTP_TTL_MINUTES * 60 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      this.logger.error({ statusCode: response.status }, 'OTP sağlayıcısı isteği reddetti');
      throw new AppError(502, 'OTP_DELIVERY_FAILED', 'Doğrulama kodu gönderilemedi.');
    }
  }
}
