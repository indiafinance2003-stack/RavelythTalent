import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { users, type UserRow } from '@/lib/db/schema';
import { jobPackages, jobPackageFeatures, platformSettings } from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { cleanText } from '@/lib/portal/candidates/profile';

/**
 * Platform administration operations (see §19).
 *
 * Every function here is reachable ONLY after `requireAdmin()` has passed in
 * the route handler. Nothing trusts a role, user id or company id supplied by
 * the client: the acting admin is passed in explicitly and every target is
 * resolved server-side.
 *
 * Suspension, reinstatement, role changes, package edits and platform setting
 * changes are all audited.
 */

/** Roles an admin may assign. Admin/owner roles are deliberately NOT here. */
export const ASSIGNABLE_ROLES = ['candidate', 'employer', 'customer'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  accountStatus: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Paginated user list for the admin console, with a role/status filter. */
export async function listUsersForAdmin(
  options: { role?: string; accountStatus?: string; limit?: number; offset?: number } = {}
): Promise<{ items: AdminUserRow[]; total: number }> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  const filters = [];
  if (options.role) filters.push(eq(users.role, options.role));
  if (options.accountStatus) filters.push(eq(users.accountStatus, options.accountStatus));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));

  const [totalRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  return {
    items: rows.map((row: UserRow) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      accountStatus: row.accountStatus,
      emailVerified: row.emailVerifiedAt !== null,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    })),
    total: totalRow?.value ?? 0,
  };
}

/**
 * Suspends a user account. The user immediately loses access: `getSessionUser`
 * only resolves 'active' accounts, so an existing session stops working too.
 */
export async function suspendUser(input: {
  userId: string;
  adminUserId: string;
  reason: string;
}): Promise<UserRow> {
  const { db } = dbFromRequest();
  const reason = cleanText(input.reason, 500);
  if (!reason) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'A suspension reason is required.');
  }

  const [row] = await db
    .update(users)
    .set({
      accountStatus: 'suspended',
      suspensionReason: reason,
      suspendedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested user was not found.', 404);

  await recordPortalAudit({
    action: 'user_suspended',
    actorUserId: input.adminUserId,
    description: 'Account suspended',
    metadata: { userId: input.userId },
  });

  return row;
}

/** Reinstates a suspended account. */
export async function reinstateUser(input: {
  userId: string;
  adminUserId: string;
}): Promise<UserRow> {
  const { db } = dbFromRequest();

  const [row] = await db
    .update(users)
    .set({
      accountStatus: 'active',
      suspensionReason: null,
      suspendedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested user was not found.', 404);

  await recordPortalAudit({
    action: 'user_reinstated',
    actorUserId: input.adminUserId,
    description: 'Account reinstated',
    metadata: { userId: input.userId },
  });

  return row;
}

/**
 * Changes a user's role. Admin/owner roles are not assignable here, so an admin
 * cannot accidentally escalate anyone (or themselves) through this endpoint.
 */
export async function changeUserRole(input: {
  userId: string;
  role: AssignableRole;
  adminUserId: string;
}): Promise<UserRow> {
  const { db } = dbFromRequest();

  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'That role cannot be assigned.');
  }

  const [row] = await db
    .update(users)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(users.id, input.userId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested user was not found.', 404);

  await recordPortalAudit({
    action: 'user_role_changed',
    actorUserId: input.adminUserId,
    description: `Role changed to ${input.role}`,
    metadata: { userId: input.userId, role: input.role },
  });

  return row;
}

/* ==========================================================================
 * Job packages (admin-managed pricing; nothing is hard-coded)
 * ========================================================================== */

export interface JobPackageInput {
  code: string;
  name: string;
  description?: string | null;
  priceMinor: number;
  currency?: string;
  credits: number;
  validityDays: number;
  status?: 'active' | 'inactive';
  isFeatured?: boolean;
  sortOrder?: number;
  features?: Array<{ key: string; value?: string | null; description?: string | null }>;
}

/** Validates a package before it can be stored. */
function assertValidPackage(input: JobPackageInput): void {
  const code = cleanText(input.code, 40);
  if (!code || !/^[a-z0-9-]+$/.test(code)) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Package code must be lowercase letters, digits or hyphens.'
    );
  }
  if (!cleanText(input.name, 120)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Package name is required.');
  }
  // Price and credits are integers in minor units / whole credits. A float or a
  // negative value is rejected rather than silently rounded.
  if (!Number.isInteger(input.priceMinor) || input.priceMinor < 0) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Price must be a non-negative integer in minor units.'
    );
  }
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > 1000) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Credits must be between 1 and 1000.');
  }
  if (!Number.isInteger(input.validityDays) || input.validityDays < 1 || input.validityDays > 3650) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'Validity must be between 1 and 3650 days.'
    );
  }
}

/** Creates a job package. Only an admin reaches this. */
export async function createJobPackage(
  input: JobPackageInput,
  adminUserId: string
) {
  const { db } = dbFromRequest();
  assertValidPackage(input);

  const created = await db.transaction(async (tx) => {
    const [pkg] = await tx
      .insert(jobPackages)
      .values({
        code: input.code.trim().toLowerCase(),
        name: input.name.trim(),
        description: cleanText(input.description, 2000),
        priceMinor: input.priceMinor,
        currency: (input.currency ?? 'INR').toUpperCase(),
        credits: input.credits,
        validityDays: input.validityDays,
        status: input.status ?? 'active',
        isFeatured: input.isFeatured ?? false,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();

    for (const feature of input.features ?? []) {
      const key = cleanText(feature.key, 60);
      if (!key) continue;
      await tx.insert(jobPackageFeatures).values({
        packageId: pkg.id,
        featureKey: key,
        featureValue: cleanText(feature.value, 200),
        description: cleanText(feature.description, 500),
      });
    }

    return pkg;
  });

  await recordPortalAudit({
    action: 'job_package_created',
    actorUserId: adminUserId,
    description: `Job package created: ${created.code}`,
    metadata: { packageId: created.id, priceMinor: created.priceMinor, credits: created.credits },
  });

  return created;
}

/** Updates an existing package (including its price). Always audited. */
export async function updateJobPackage(
  packageId: string,
  input: Partial<JobPackageInput>,
  adminUserId: string
) {
  const { db } = dbFromRequest();

  const [existing] = await db
    .select()
    .from(jobPackages)
    .where(eq(jobPackages.id, packageId))
    .limit(1);
  if (!existing) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested package was not found.', 404);
  }

  // Re-validate the merged result so a partial update cannot produce an invalid
  // package (e.g. setting credits to 0 without sending the other fields).
  assertValidPackage({
    code: input.code ?? existing.code,
    name: input.name ?? existing.name,
    priceMinor: input.priceMinor ?? existing.priceMinor,
    credits: input.credits ?? existing.credits,
    validityDays: input.validityDays ?? existing.validityDays,
  });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = cleanText(input.description, 2000);
  if (input.priceMinor !== undefined) patch.priceMinor = input.priceMinor;
  if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
  if (input.credits !== undefined) patch.credits = input.credits;
  if (input.validityDays !== undefined) patch.validityDays = input.validityDays;
  if (input.status !== undefined) patch.status = input.status;
  if (input.isFeatured !== undefined) patch.isFeatured = input.isFeatured;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  const [row] = await db
    .update(jobPackages)
    .set(patch)
    .where(eq(jobPackages.id, packageId))
    .returning();

  await recordPortalAudit({
    action: 'job_package_updated',
    actorUserId: adminUserId,
    description: `Job package updated: ${row.code}`,
    metadata: { packageId: row.id, priceMinor: row.priceMinor, credits: row.credits },
  });

  return row;
}

/** Packages, with their features, for the admin and employer catalogue. */
export async function listJobPackages(options: { includeInactive?: boolean } = {}) {
  const { db } = dbFromRequest();

  const pkgs = await db
    .select()
    .from(jobPackages)
    .where(options.includeInactive ? undefined : eq(jobPackages.status, 'active'))
    .orderBy(jobPackages.sortOrder, jobPackages.priceMinor);

  const features = await db.select().from(jobPackageFeatures);
  const byPackage = new Map<string, Array<{ key: string; value: string | null; description: string | null }>>();
  for (const feature of features) {
    const list = byPackage.get(feature.packageId) ?? [];
    list.push({
      key: feature.featureKey,
      value: feature.featureValue,
      description: feature.description,
    });
    byPackage.set(feature.packageId, list);
  }

  return pkgs.map((pkg) => ({ ...pkg, features: byPackage.get(pkg.id) ?? [] }));
}

/* ==========================================================================
 * Platform settings
 * ========================================================================== */

export const PLATFORM_SETTING_KEYS = [
  'job_approval_required',
  'job_credit_required',
  'job_default_validity_days',
  'require_verified_email_to_apply',
  'platform_announcement',
] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

/** Reads one setting, falling back to the supplied default. */
export async function getPlatformSetting<T>(
  key: PlatformSettingKey,
  fallback: T
): Promise<T> {
  const { db } = dbFromRequest();
  const [row] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  return row ? (row.value as T) : fallback;
}

/** Writes a setting. Always audited, because these change platform behaviour. */
export async function setPlatformSetting(input: {
  key: PlatformSettingKey;
  value: unknown;
  adminUserId: string;
}): Promise<void> {
  const { db } = dbFromRequest();

  await db
    .insert(platformSettings)
    .values({
      key: input.key,
      value: input.value,
      updatedByUserId: input.adminUserId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: input.value, updatedByUserId: input.adminUserId, updatedAt: new Date() },
    });

  await recordPortalAudit({
    action: 'platform_setting_changed',
    actorUserId: input.adminUserId,
    description: `Setting changed: ${input.key}`,
    metadata: { key: input.key, value: input.value },
  });
}

/** All settings, for the admin configuration screen. */
export async function listPlatformSettings(): Promise<
  Array<{ key: string; value: unknown; updatedAt: string }>
> {
  const { db } = dbFromRequest();
  const rows = await db.select().from(platformSettings).orderBy(platformSettings.key);
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
