import 'server-only';
import { and, eq } from 'drizzle-orm';
import { getSessionUser } from '@/lib/auth/session';
import { dbFromRequest } from '@/lib/db/request';
import { users, type UserRow } from '@/lib/db/schema';
import {
  candidateProfiles,
  employerProfiles,
  type CandidateProfileRow,
  type CompanyRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import type { PortalUser } from '@/lib/portal/authz';
import { requireActiveAccount, requireAdmin, requireCandidate, requireEmployer } from '@/lib/portal/authz';

/**
 * Route-handler authentication bridge for Ravelyth Talent.
 *
 * Identity ALWAYS comes from the HttpOnly session cookie. There is no code path
 * in these helpers that reads a user id, role or company id from a header,
 * query or body — that is what makes the API resistant to privilege escalation.
 */

/** The authenticated user, or null. */
export async function currentPortalUser(): Promise<PortalUser | null> {
  const session = await getSessionUser();
  if (!session) return null;

  // The session id is trusted; the ROLE and account status are re-read from the
  // database so a suspension or role change takes effect on the next request.
  const { db } = dbFromRequest();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      accountStatus: users.accountStatus,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!row) return null;
  return row;
}

/** Throws 401 when unauthenticated, 403 when suspended. */
export async function requirePortalUser(): Promise<PortalUser> {
  return requireActiveAccount(await currentPortalUser());
}

export async function requireCandidateUser(): Promise<PortalUser> {
  return requireCandidate(await currentPortalUser());
}

export async function requireEmployerUser(): Promise<PortalUser> {
  return requireEmployer(await currentPortalUser());
}

export async function requireAdminUser(): Promise<PortalUser> {
  return requireAdmin(await currentPortalUser());
}

/**
 * The caller's candidate profile, resolved from the session.
 * Throws 404 if the account has no profile yet.
 */
export async function requireCandidateProfile(): Promise<CandidateProfileRow> {
  const user = await requireCandidateUser();
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, user.id))
    .limit(1);
  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'No candidate profile was found.', 404);
  }
  return row;
}

/**
 * The caller's company, resolved from the session.
 * Throws 403 when the employer has no company linked yet.
 */
export async function requireCompanyContext(): Promise<{ company: CompanyRow; user: PortalUser }> {
  const user = await requireEmployerUser();
  const { db } = dbFromRequest();
  const [row] = await db
    .select({ company: employerProfiles.companyId })
    .from(employerProfiles)
    .where(eq(employerProfiles.userId, user.id))
    .limit(1);

  if (!row) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'No company is linked to this account yet.',
      403
    );
  }

  const { companies } = await import('@/lib/db/portal-schema');
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, row.company))
    .limit(1);

  if (!company) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
  }
  return { company, user };
}

/** Full user row for the current session (used by /me style endpoints). */
export async function currentUserRow(): Promise<UserRow | null> {
  const session = await getSessionUser();
  if (!session) return null;
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.id)))
    .limit(1);
  return row ?? null;
}

