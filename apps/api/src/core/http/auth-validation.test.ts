import { describe, expect, it } from 'vitest';
import { otpVerifySchema, registerSchema } from '@heytaksi/shared';

describe('authentication contracts', () => {
  it('rejects weak passwords and local phone formats', () => {
    expect(registerSchema.safeParse({ email: 'test@example.com', password: '12345678', firstName: 'Ada', lastName: 'Lovelace', phone: '05551112233', device: { id: crypto.randomUUID(), platform: 'web' } }).success).toBe(false);
  });
  it('accepts a six digit OTP with an E.164 phone', () => {
    expect(otpVerifySchema.safeParse({ phone: '+905551112233', purpose: 'login', code: '123456', device: { id: crypto.randomUUID(), platform: 'web' } }).success).toBe(true);
  });
});
