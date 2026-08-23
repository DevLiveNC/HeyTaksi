import { AppError } from '../errors/app-error.js';
import type { ZodType } from 'zod';

export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Gönderilen bilgiler geçersiz.', result.error.flatten());
  }
  return result.data;
}
