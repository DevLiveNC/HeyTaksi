import { describe, expect, it } from 'vitest';
import { isVercelCronRequest } from './cron-auth.js';

describe('isVercelCronRequest', () => {
  it('accepts the Bearer CRON_SECRET header', () => {
    expect(isVercelCronRequest({ authorization: 'Bearer tick-secret' }, 'tick-secret')).toBe(true);
  });

  it('rejects missing or mismatched secrets', () => {
    expect(isVercelCronRequest({ authorization: 'Bearer tick-secret' })).toBe(false);
    expect(isVercelCronRequest({ authorization: 'Bearer other' }, 'tick-secret')).toBe(false);
    expect(isVercelCronRequest({}, 'tick-secret')).toBe(false);
  });
});
