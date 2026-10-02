export enum AppErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_DOMAIN = 'INVALID_DOMAIN',
  DNS_TIMEOUT = 'DNS_TIMEOUT',
  NXDOMAIN = 'NXDOMAIN',
  SERVFAIL = 'SERVFAIL',
  REFUSED = 'REFUSED',
  DNS_ERROR = 'DNS_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  PARSER_ERROR = 'PARSER_ERROR',
  UNSUPPORTED_OPERATION = 'UNSUPPORTED_OPERATION',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EMAIL_TAKEN = 'EMAIL_TAKEN',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  PASSWORD_RESET_INVALID = 'PASSWORD_RESET_INVALID',
  PASSWORD_RESET_UNAVAILABLE = 'PASSWORD_RESET_UNAVAILABLE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  BLOCKED_TARGET = 'BLOCKED_TARGET',
  TARGET_UNREACHABLE = 'TARGET_UNREACHABLE',
  HTTP_TIMEOUT = 'HTTP_TIMEOUT',
  TOO_MANY_REDIRECTS = 'TOO_MANY_REDIRECTS',
  UNSAFE_REDIRECT = 'UNSAFE_REDIRECT',
  TLS_ERROR = 'TLS_ERROR',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  VERIFICATION_INVALID = 'VERIFICATION_INVALID',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
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

export class InvalidDomainError extends AppError {
  constructor(domain: string, reason: string) {
    super(
      AppErrorCode.INVALID_DOMAIN,
      `Invalid domain: ${domain} - ${reason}`,
      400,
      { domain, reason }
    );
    this.name = 'InvalidDomainError';
  }
}

export class DNSError extends AppError {
  constructor(message: string, code?: AppErrorCode, details?: Record<string, unknown>) {
    super(code || AppErrorCode.DNS_ERROR, message, 503, details);
    this.name = 'DNSError';
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

export class ParserError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(AppErrorCode.PARSER_ERROR, message, 400, details);
    this.name = 'ParserError';
  }
}

/**
 * Raised when a request asks Ravelyth to reach a target that is deliberately
 * out of scope: non-public addresses, localhost, unsupported ports, or
 * protocols other than http/https. Keeps the tooling from being turned into an
 * internal-network scanner (SSRF).
 */
export class BlockedTargetError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(AppErrorCode.BLOCKED_TARGET, message, 400, details);
    this.name = 'BlockedTargetError';
  }
}

/** The target is allowed but did not respond (refused, reset, unreachable). */
export class TargetUnreachableError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(AppErrorCode.TARGET_UNREACHABLE, message, 502, details);
    this.name = 'TargetUnreachableError';
  }
}

/** A remote service (for example an RDAP registry) failed or misbehaved. */
export class UpstreamError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(AppErrorCode.UPSTREAM_ERROR, message, 502, details);
    this.name = 'UpstreamError';
  }
}
