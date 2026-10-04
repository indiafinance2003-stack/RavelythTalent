export enum AppErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  PASSWORD_RESET_INVALID = 'PASSWORD_RESET_INVALID',
  PASSWORD_RESET_UNAVAILABLE = 'PASSWORD_RESET_UNAVAILABLE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  VERIFICATION_INVALID = 'VERIFICATION_INVALID',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  /**
   * The company has used every job post its plan allows for this billing
   * period and holds no credits. A distinct code so the dashboard can offer the
   * upgrade action instead of showing a generic validation failure.
   */
  PLAN_LIMIT_REACHED = 'PLAN_LIMIT_REACHED',
  PAYMENT_NOT_CONFIGURED = 'PAYMENT_NOT_CONFIGURED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

export class AppError extends Error {
  code: AppErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(AppErrorCode.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfter?: number) {
    super(
      AppErrorCode.RATE_LIMIT_EXCEEDED,
      message,
      429,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = 'RateLimitError';
  }
}

export class RequestTooLargeError extends AppError {
  constructor(message: string, maxSize?: number) {
    super(
      AppErrorCode.REQUEST_TOO_LARGE,
      message,
      413,
      maxSize ? { maxSize } : undefined
    );
    this.name = 'RequestTooLargeError';
  }
}
