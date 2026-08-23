import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import { validate } from './validation.js';

describe('validate', () => {
  it('returns typed data for valid input', () => {
    expect(validate(z.object({ id: z.string().uuid() }), { id: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({ id: '550e8400-e29b-41d4-a716-446655440000' });
  });
  it('normalizes invalid input as an application error', () => {
    expect(() => validate(z.string().min(2), '')).toThrow(AppError);
  });
});
