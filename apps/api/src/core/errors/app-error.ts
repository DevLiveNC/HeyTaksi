export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(message = 'Bu işlem için oturum açmalısınız.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Bu işlem için yetkiniz bulunmuyor.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }
}
