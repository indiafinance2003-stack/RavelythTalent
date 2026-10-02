import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/**
 * Portal authorization guards.
 *
 * Two rules hold everywhere in Ravelyth Talent:
 *
 *  1. Identity is derived ONLY from the server-side session (see
 *     `requirePortalUser`). A role, user id, company id or candidate id taken
 *     from a request body/query is never used to make an authorization
 *     decision.
 *  2. Every company- or candidate-scoped read/write is filtered by the caller's
 *     own id in the SQL WHERE clause. A guessed record id therefore returns
 *     "not found" rather than another tenant's data (no IDOR).
 */

/** Roles that may use Ravelyth Talent. */
export const PORTAL_ROLES = ['candidate', 'employer', 'admin'] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

/**
 * Roles considered platform administrators.
 *
 * 'owner' and 'staff' are the pre-existing DNS-tools admin roles and are kept
 * so the current admin system continues to work; 'admin' is the portal role.
 */
export const ADMIN_ROLES = ['owner', 'staff', 'admin'] as const;

export function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isPortalRole(role: string): role is PortalRole {
  return (PORTAL_ROLES as readonly string[]).includes(role);
}

export function isCandidateRole(role: string): boolean {
  return role === 'candidate';
}

export function isEmployerRole(role: string): boolean {
  return role === 'employer';
}

/** The authenticated portal user, resolved from the server session. */
export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: string;
  accountStatus: string;
  emailVerifiedAt: Date | null;
}

/** Thrown for any missing authentication. */
export function requireAuthenticated(user: PortalUser | null): PortalUser {
  if (!user) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, 'Authentication required', 401);
  }
  return user;
}

/** Requires an authenticated user whose account is not suspended. */
export function requireActiveAccount(user: PortalUser | null): PortalUser {
  const authenticated = requireAuthenticated(user);
  if (authenticated.accountStatus === 'suspended') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This account has been suspended. Please contact support.',
      403
    );
  }
  return authenticated;
}

export function requireCandidate(user: PortalUser | null): PortalUser {
  const active = requireActiveAccount(user);
  if (!isCandidateRole(active.role)) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This action is only available to candidate accounts.',
      403
    );
  }
  return active;
}

export function requireEmployer(user: PortalUser | null): PortalUser {
  const active = requireActiveAccount(user);
  if (!isEmployerRole(active.role)) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This action is only available to employer accounts.',
      403
    );
  }
  return active;
}

/**
 * Requires a platform administrator. Authorization is decided from the session
 * role only — never from anything the client sends.
 */
export function requireAdmin(user: PortalUser | null): PortalUser {
  const active = requireActiveAccount(user);
  if (!isAdminRole(active.role)) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'Administrator access is required for this action.',
      403
    );
  }
  return active;
}

/**
 * Confirms a record belongs to the expected owner before it is returned.
 *
 * Returns 404 (not 403) for another tenant's record so a guessed id never
 * confirms that the id exists at all.
 */
export function assertOwnership<T extends { id: string; candidateId?: string; userId?: string; companyId?: string }>(
  record: T | null | undefined,
  expected: { candidateId?: string; userId?: string; companyId?: string },
  resource: string
): T {
  if (!record) {
    throw notFound(resource);
  }
  const owned =
    (expected.candidateId !== undefined && record.candidateId === expected.candidateId) ||
    (expected.userId !== undefined && record.userId === expected.userId) ||
    (expected.companyId !== undefined && record.companyId === expected.companyId);
  if (!owned) {
    throw notFound(resource);
  }
  return record;
}

/** Throws a consistent 404 for a missing resource. */
export function notFound(resource: string): AppError {
  return new AppError(AppErrorCode.NOT_FOUND, `The requested ${resource} was not found.`, 404);
}

/** Throws a consistent 403 for a failed ownership/membership check. */
export function forbidden(message = 'You do not have access to this resource.'): AppError {
  return new AppError(AppErrorCode.FORBIDDEN, message, 403);
}

/** Throws a consistent 409 for a conflicting state change. */
export function conflict(message: string): AppError {
  return new AppError(AppErrorCode.CONFLICT, message, 409);
}

/** Throws a 422 when a business rule (not input shape) rejects the request. */
export function unprocessable(message: string): AppError {
  return new AppError(AppErrorCode.VALIDATION_ERROR, message, 422);
}
