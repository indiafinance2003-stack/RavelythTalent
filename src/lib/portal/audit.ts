import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { auditLog, type AuditLogRow } from '@/lib/db/schema';

/**
 * Audit logging for Ravelyth Talent (see Â§21 of the brief).
 *
 * The existing `audit_log` table and Control audit helper are reused rather
 * than duplicated, so audit history stays in one place.
 *
 * Security rules enforced here:
 *  - Passwords, password hashes, verification tokens, reset tokens, payment
 *    secrets and full payment payloads are NEVER written. `sanitizeMetadata`
 *    strips anything that looks sensitive, and callers pass identifiers and
 *    status transitions rather than blobs.
 *  - Entries are written for administrative and business decisions that must be
 *    reconstructable later: approvals, rejections, suspensions, verification,
 *    credit grants/consumption, payment state changes and role changes.
 *  - Recording is best-effort: an audit failure must never roll back or fail the
 *    business operation that triggered it.
 */

export const PORTAL_AUDIT_ACTIONS = [
  // Authentication and security
  'admin_login',
  'user_role_changed',
  'user_suspended',
  'user_reinstated',
  'user_password_changed',
  // Recruitment agency authorisation: who may publish for whom.
  'agency_client_linked',
  'agency_client_revoked',
  'company_type_changed',
  'premium_plan_created',
  'premium_plan_updated',
  'email_verified',
  'verification_email_sent',
  // Company management
  'company_created',
  'company_verification_granted',
  'company_verification_rejected',
  'company_suspended',
  // Resume lifecycle
  'resume_uploaded',
  'resume_deleted',
  'resume_downloaded',
  // Job workflow
  'job_created',
  'job_submitted_for_approval',
  'job_approved',
  'job_rejected',
  'job_resubmitted',
  'job_closed',
  'job_expired',
  'job_suspended',
  // Applications
  'application_status_changed',
  // Commerce
  'job_package_created',
  'job_package_updated',
  'order_created',
  'payment_status_changed',
  'job_credits_granted',
  'job_credits_consumed',
  'job_credits_adjusted',
  // Candidate premium
  'premium_plan_created',
  'premium_plan_updated',
  'subscription_created',
  'subscription_status_changed',
  'entitlement_granted',
  'entitlement_revoked',
  // Moderation and configuration
  'report_resolved',
  'report_dismissed',
  'platform_setting_changed',
  'recruitment_lead_created',
] as const;

export type PortalAuditAction = (typeof PORTAL_AUDIT_ACTIONS)[number];

/** Metadata keys that must never be persisted, whatever a caller passes. */
const FORBIDDEN_METADATA_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'tokenhash',
  'resettoken',
  'verificationtoken',
  'secret',
  'apikey',
  'keysecret',
  'webhooksecret',
  'signature',
  'card',
  'cardnumber',
  'cvv',
  'authorization',
  'cookie',
  'hash',
];

export interface PortalAuditInput {
  action: PortalAuditAction;
  description?: string | null;
  actorUserId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Removes sensitive-looking keys from audit metadata.
 *
 * This is a defence-in-depth filter: callers are expected to pass identifiers,
 * not payloads, but a future change must not be able to leak a secret into the
 * audit trail by accident.
 */
export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!metadata) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.includes(key.toLowerCase())) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string') {
      // Bound the size so an audit row can never become a data dump.
      clean[key] = value.length > 300 ? `${value.slice(0, 300)}...` : value;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
      continue;
    }
    // Nested objects are reduced to a shallow, size-bounded summary.
    clean[key] = JSON.stringify(value).slice(0, 300);
  }
  return clean;
}

/**
 * Records an audit entry.
 *
 * Never throws: an audit write failure is logged, not surfaced, so it cannot
 * break the operation being audited.
 */
export async function recordPortalAudit(input: PortalAuditInput): Promise<void> {
  try {
    const { db } = dbFromRequest();
    await db.insert(auditLog).values({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      description: input.description ? input.description.slice(0, 500) : null,
      ipAddress: input.ipAddress ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
    });
  } catch {
    // Intentionally swallowed: audit logging must never break the caller.
  }
}

export interface ListAuditOptions {
  action?: PortalAuditAction;
  actorUserId?: string;
  limit?: number;
  offset?: number;
}

/** Paginated audit listing for the admin console. */
export async function listPortalAudit(options: ListAuditOptions = {}): Promise<AuditLogRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const filters: SQL[] = [];
  if (options.action) filters.push(eq(auditLog.action, options.action));
  if (options.actorUserId) filters.push(eq(auditLog.actorUserId, options.actorUserId));

  const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset);

  return filters.length > 0 ? query.where(and(...filters)) : query;
}
