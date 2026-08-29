import { describe, expect, it } from 'vitest';
import { describeAuthFailure, networkFailureMessage } from '../../packages/ui/src/auth/auth-errors.ts';

describe('describeAuthFailure', () => {
  it('rewrites browser network errors such as Safari Load failed', () => {
    expect(describeAuthFailure(new Error('Load failed'))).toBe(networkFailureMessage);
    expect(describeAuthFailure(new Error('Failed to fetch'))).toBe(networkFailureMessage);
    expect(describeAuthFailure(new Error('fetch failed'))).toBe(networkFailureMessage);
    expect(describeAuthFailure(new Error('FUNCTION_INVOCATION_FAILED'))).toBe(networkFailureMessage);
  });

  it('keeps API validation and credential errors', () => {
    expect(describeAuthFailure(new Error('E-posta veya şifre hatalı.'))).toBe('E-posta veya şifre hatalı.');
  });
});
