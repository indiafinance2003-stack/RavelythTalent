import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  CONSENT_PURPOSES,
  userConsents,
  type ConsentPurpose,
  type UserConsentRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { rowsFromExecute } from '@/lib/db/rows';

/**
 * Purpose-specific consent records.
 *
 * Design intent (see §24 of the brief): a candidate applying to one public job
 * must NOT be treated as blanket consent for unrelated recruitment processing.
 * Each purpose is therefore an independent record with its own policy version:
 *
 *  - withdrawing `marketing` leaves `job_application` untouched;
 *  - `recruitment_services` is entirely separate from the portal, which is how
 *    Ravelyth's recruitment service stays a distinct commercial relationship.
 *
 * This module stores and reports consent. It contains NO legal copy: the final
 * wording is agreed in the legal/frontend stage.
 */

/** Version recorded when a purpose is accepted before any published version. */
export const CONSENT_VERSION_UNSPECIFIED = 'unspecified';

export interface RecordConsentInput {
  userId: string;
  purpose: ConsentPurpose;
  policyVersion: string;
  policyReference?: string | null;
  ipAddress?: string | null;
  acceptedAt?: Date;
}

function assertPurpose(purpose: string): asserts purpose is ConsentPurpose {
  if (!(CONSENT_PURPOSES as readonly string[]).includes(purpose)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, `Unsupported consent purpose: ${purpose}`);
  }
}

/**
 * Records acceptance for a purpose.
 *
 * Re-accepting an existing purpose updates the stored version and clears any
 * withdrawal, keeping one live row per (user, purpose).
 */
export async function recordConsent(input: RecordConsentInput): Promise<UserConsentRow> {
  assertPurpose(input.purpose);
  const now = input.acceptedAt ?? new Date();

  const { db } = dbFromRequest();
  const rows = await db
    .insert(userConsents)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      policyVersion: input.policyVersion,
      policyReference: input.policyReference ?? null,
      ipAddress: input.ipAddress ?? null,
      acceptedAt: now,
    })
    .onConflictDoUpdate({
      // The unique index on (user_id, purpose) is what makes this idempotent.
      target: [userConsents.userId, userConsents.purpose],
      set: {
        policyVersion: input.policyVersion,
        policyReference: input.policyReference ?? null,
        acceptedAt: now,
        withdrawnAt: null,
      },
    })
    .returning();

  return rows[0];
}

/**
 * Withdraws consent for a purpose.
 *
 * The row is kept (with `withdrawn_at` set) rather than deleted, so the platform
 * can demonstrate when consent was given and when it was withdrawn.
 * Returns false when there was nothing to withdraw.
 */
export async function withdrawConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
  assertPurpose(purpose);
  const { db } = dbFromRequest();

  const updated = await db
    .update(userConsents)
    .set({ withdrawnAt: new Date() })
    .where(
      and(
        eq(userConsents.userId, userId),
        eq(userConsents.purpose, purpose),
        isNull(userConsents.withdrawnAt)
      )
    )
    .returning({ id: userConsents.id });

  return updated.length > 0;
}

/** Whether a purpose is currently granted (accepted and not withdrawn). */
export async function hasConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
  assertPurpose(purpose);
  const { db } = dbFromRequest();
  const rows = await db
    .select({ id: userConsents.id })
    .from(userConsents)
    .where(
      and(
        eq(userConsents.userId, userId),
        eq(userConsents.purpose, purpose),
        isNull(userConsents.withdrawnAt)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Enforces a consent requirement.
 *
 * Throws a 403 when consent has not been granted, so a service can never
 * process personal data for an unconsented purpose.
 */
export async function requireConsent(userId: string, purpose: ConsentPurpose): Promise<void> {
  if (!(await hasConsent(userId, purpose))) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'Your consent is required before we can process your information for this purpose.',
      403
    );
  }
}

/** Full consent history for a user, newest first. */
export async function listConsents(userId: string): Promise<
  Array<{
    purpose: string;
    policyVersion: string;
    policyReference: string | null;
    acceptedAt: string;
    withdrawnAt: string | null;
    granted: boolean;
  }>
> {
  const { db } = dbFromRequest();
  const rows = await db
    .select()
    .from(userConsents)
    .where(eq(userConsents.userId, userId))
    .orderBy(desc(userConsents.acceptedAt));

  return rows.map((row) => ({
    purpose: row.purpose,
    policyVersion: row.policyVersion,
    policyReference: row.policyReference,
    acceptedAt: row.acceptedAt.toISOString(),
    withdrawnAt: row.withdrawnAt ? row.withdrawnAt.toISOString() : null,
    granted: row.withdrawnAt === null,
  }));
}

/** Aggregate counts per purpose, for admin/compliance reporting. */
export async function consentSummary(): Promise<
  Array<{ purpose: string; granted: number; withdrawn: number }>
> {
  const { db } = dbFromRequest();
  const result = await db.execute(sql`
    SELECT purpose,
           count(*) FILTER (WHERE withdrawn_at IS NULL)::int AS granted,
           count(*) FILTER (WHERE withdrawn_at IS NOT NULL)::int AS withdrawn
      FROM user_consents
     GROUP BY purpose
     ORDER BY purpose
  `);
  return rowsFromExecute<{ purpose: string; granted: number; withdrawn: number }>(result);
}
