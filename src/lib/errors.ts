/**
 * Shared application errors.
 *
 * Every error carries an HTTP status and a stable machine-readable code so the
 * API wrapper can translate it into a consistent JSON response.
 */

export class AppError extends Error {
  status: number;
  code: string;
  issues?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    status = 500,
    code = "server_error",
    issues?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to do that.", code = "forbidden", status = 403) {
    super(message, status, code);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "You must be signed in to do that.") {
    super(message, 401, "unauthenticated");
  }
}

export class CsrfError extends AppError {
  constructor(message = "Cross-site request blocked.") {
    super(message, 403, "csrf_failed");
  }
}

export class RateLimitError extends AppError {
  retryAfterSeconds: number;

  constructor(message = "Too many requests. Please try again later.", retryAfterSeconds = 60) {
    super(message, 429, "rate_limited");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested resource was not found.") {
    super(message, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "The submitted data is invalid.",
    issues?: Array<{ path: string; message: string }>,
  ) {
    super(message, 422, "validation_failed", issues);
  }
}

export class ConflictError extends AppError {
  constructor(message = "That action conflicts with the current state.") {
    super(message, 409, "conflict");
  }
}

export class PaymentError extends AppError {
  constructor(message = "Payment could not be completed.") {
    super(message, 402, "payment_failed");
  }
}