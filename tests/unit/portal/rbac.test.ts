import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  assertOwnership,
  conflict,
  isAdminRole,
  isCandidateRole,
  isEmployerRole,
  isPortalRole,
  requireActiveAccount,
  requireAdmin,
  requireCandidate,
  requireEmployer,
  type PortalUser,
} from '@/lib/portal/authz';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/** Test items 15-18 and 64: server-side authorization must hold regardless of
 * anything the client sends. */

function user(overrides: Partial<PortalUser> = {}): PortalUser {
  return {
    id: 'user-1',
    email: 'a@example.com',
    name: 'A',
    role: 'candidate',
    accountStatus: 'active',
    emailVerifiedAt: new Date(),
    ...overrides,
  };
}

describe('role classification', () => {
  it('recognises portal roles', () => {
    expect(isPortalRole('candidate')).toBe(true);
    expect(isPortalRole('employer')).toBe(true);
    expect(isPortalRole('admin')).toBe(true);
    expect(isPortalRole('customer')).toBe(false);
  });

  it('treats staff and owner as administrators alongside admin', () => {
    for (const role of ADMIN_ROLES) {
      expect(isAdminRole(role)).toBe(true);
    }
    expect(isAdminRole('employer')).toBe(false);
    expect(isAdminRole('candidate')).toBe(false);
  });

  it('separates candidate and employer roles', () => {
    expect(isCandidateRole('candidate')).toBe(true);
    expect(isCandidateRole('employer')).toBe(false);
    expect(isEmployerRole('employer')).toBe(true);
    expect(isEmployerRole('candidate')).toBe(false);
  });
});

describe('authorization guards', () => {
  it('throws 401 for an unauthenticated request', () => {
    expect(() => requireCandidate(null)).toThrowError(AppError);
    try {
      requireCandidate(null);
    } catch (error) {
      expect((error as AppError).statusCode).toBe(401);
    }
  });

  it('blocks a suspended account on every guarded action', () => {
    const suspended = user({ accountStatus: 'suspended' });
    expect(() => requireActiveAccount(suspended)).toThrowError(/suspended/i);
    expect(() => requireCandidate(suspended)).toThrowError(/suspended/i);
    expect(() => requireEmployer(suspended)).toThrowError(/suspended/i);
    expect(() => requireAdmin(suspended)).toThrowError(/suspended/i);
  });

  it('prevents a candidate from using employer-only actions', () => {
    expect(() => requireEmployer(user({ role: 'candidate' }))).toThrowError(/employer accounts/i);
    try {
      requireEmployer(user({ role: 'candidate' }));
    } catch (error) {
      expect((error as AppError).statusCode).toBe(403);
    }
  });

  it('prevents an employer from using candidate-only actions', () => {
    expect(() => requireCandidate(user({ role: 'employer' }))).toThrowError(/candidate accounts/i);
  });

  it('prevents a candidate or employer from reaching admin actions', () => {
    for (const role of ['candidate', 'employer', 'customer']) {
      expect(() => requireAdmin(user({ role }))).toThrowError(/Administrator access/i);
    }
  });

  it('allows admins (and the legacy staff/owner roles) through', () => {
    for (const role of ['admin', 'staff', 'owner']) {
      expect(requireAdmin(user({ role })).role).toBe(role);
    }
  });
});

describe('ownership checks (IDOR protection)', () => {
  it('returns a record the caller owns', () => {
    const record = { id: 'r1', companyId: 'c1' };
    expect(assertOwnership(record, { companyId: 'c1' }, 'job')).toBe(record);
  });

  it('hides another tenant record behind a 404 rather than a 403', () => {
    try {
      assertOwnership({ id: 'r1', companyId: 'other' }, { companyId: 'mine' }, 'job');
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
    }
  });

  it('treats a missing record as not found', () => {
    expect(() => assertOwnership(null, { companyId: 'c1' }, 'job')).toThrowError(/not found/i);
    expect(() => assertOwnership(undefined, { candidateId: 'c1' }, 'resume')).toThrowError(
      /not found/i
    );
  });
});

describe('error helpers', () => {
  it('builds a 409 conflict', () => {
    expect(conflict('already exists').statusCode).toBe(409);
  });

  it('uses the extended error codes', () => {
    expect(AppErrorCode.CONFLICT).toBe('CONFLICT');
    expect(AppErrorCode.INSUFFICIENT_CREDITS).toBe('INSUFFICIENT_CREDITS');
    expect(AppErrorCode.EMAIL_NOT_VERIFIED).toBe('EMAIL_NOT_VERIFIED');
    expect(AppErrorCode.APPROVAL_REQUIRED).toBe('APPROVAL_REQUIRED');
    expect(AppErrorCode.VERIFICATION_INVALID).toBe('VERIFICATION_INVALID');
    expect(AppErrorCode.PAYMENT_NOT_CONFIGURED).toBe('PAYMENT_NOT_CONFIGURED');
  });
});
