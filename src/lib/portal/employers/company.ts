import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  companies,
  employerCompanyMembers,
  employerProfiles,
  type CompanyRow,
  type EmployerCompanyMemberRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { cleanText, sanitizeUrl } from '@/lib/portal/candidates/profile';

/**
 * Companies and employer accounts (see Â§7).
 *
 * Key behaviours:
 *  - A company is created as 'pending' verification. Verification is NEVER
 *    automatic; only an admin action can move it to 'verified', and that is
 *    always audited.
 *  - Several authorised employer users can belong to one company, so a company
 *    never has to share a single login.
 *  - Every company-scoped read filters by the company id resolved from the
 *    caller's own employer profile, so a guessed id reaches nothing.
 */

/** URL-safe slug generated from a company name. */
export function slugifyCompanyName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : 'company';
}

/** Makes a slug unique by appending a short suffix on collision. */
async function uniqueSlug(name: string): Promise<string> {
  const { db } = dbFromRequest();
  const base = slugifyCompanyName(name);

  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, base))
    .limit(1);
  if (!existing) return base;

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface CreateCompanyInput {
  ownerUserId: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  companySize?: string | null;
  location?: string | null;
  description?: string | null;
  officialEmail?: string | null;
  phone?: string | null;
  authorizedContactName?: string | null;
  authorizedContactPhone?: string | null;
  jobTitle?: string | null;
}

/**
 * Creates a company for an employer and links the creator as its owner.
 *
 * The company always starts at verification_status = 'pending': nothing in this
 * path can make a company verified.
 */
export async function createCompanyForEmployer(
  input: CreateCompanyInput
): Promise<{ company: CompanyRow; member: EmployerCompanyMemberRow }> {
  const { db } = dbFromRequest();

  const name = cleanText(input.name, 160);
  if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Company name is required.');

  const slug = await uniqueSlug(name);

  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        name,
        slug,
        verificationStatus: 'pending',
        officialEmail: cleanText(input.officialEmail, 254),
        phone: cleanText(input.phone, 32),
        website: sanitizeUrl(input.website),
        industry: cleanText(input.industry, 80),
        companySize: cleanText(input.companySize, 40),
        location: cleanText(input.location, 120),
        description: cleanText(input.description, 4000),
        authorizedContactName: cleanText(input.authorizedContactName, 120),
        authorizedContactPhone: cleanText(input.authorizedContactPhone, 32),
      })
      .returning();

    await tx.insert(employerProfiles).values({
      userId: input.ownerUserId,
      companyId: company.id,
      jobTitle: cleanText(input.jobTitle, 120),
      isPrimaryContact: true,
    });

    const [member] = await tx
      .insert(employerCompanyMembers)
      .values({
        companyId: company.id,
        userId: input.ownerUserId,
        memberRole: 'owner',
        status: 'active',
      })
      .returning();

    await recordPortalAudit({
      action: 'company_created',
      actorUserId: input.ownerUserId,
      description: `Company created: ${company.name}`,
      metadata: { companyId: company.id },
    });

    return { company, member };
  });
}

/** The company the given employer user acts for, or null. */
export async function getEmployerCompany(
  userId: string
): Promise<{ company: CompanyRow; memberRole: string } | null> {
  const { db } = dbFromRequest();

  const [row] = await db
    .select({ company: companies, memberRole: employerCompanyMembers.memberRole })
    .from(employerProfiles)
    .innerJoin(companies, eq(employerProfiles.companyId, companies.id))
    .leftJoin(
      employerCompanyMembers,
      and(
        eq(employerCompanyMembers.companyId, companies.id),
        eq(employerCompanyMembers.userId, userId)
      )
    )
    .where(eq(employerProfiles.userId, userId))
    .limit(1);

  return row ? { company: row.company, memberRole: row.memberRole ?? 'member' } : null;
}

/**
 * Resolves the caller's company or throws. Route handlers use this so no
 * employer action can run without a company context.
 */
export async function requireEmployerCompany(userId: string): Promise<CompanyRow> {
  const resolved = await getEmployerCompany(userId);
  if (!resolved) {
    throw new AppError(AppErrorCode.FORBIDDEN, 'No company is linked to this account yet.', 403);
  }
  return resolved.company;
}

/**
 * Updates a company. Verification status is deliberately NOT updatable here: an
 * employer can never verify its own company.
 */
export async function updateCompany(
  companyId: string,
  input: Partial<Omit<CreateCompanyInput, 'ownerUserId'>>
): Promise<CompanyRow> {
  const { db } = dbFromRequest();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = cleanText(input.name, 160);
    if (!name) throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Company name is required.');
    patch.name = name;
  }
  if (input.website !== undefined) patch.website = sanitizeUrl(input.website);
  if (input.industry !== undefined) patch.industry = cleanText(input.industry, 80);
  if (input.companySize !== undefined) patch.companySize = cleanText(input.companySize, 40);
  if (input.location !== undefined) patch.location = cleanText(input.location, 120);
  if (input.description !== undefined) patch.description = cleanText(input.description, 4000);
  if (input.phone !== undefined) patch.phone = cleanText(input.phone, 32);
  if (input.officialEmail !== undefined) patch.officialEmail = cleanText(input.officialEmail, 254);
  if (input.authorizedContactName !== undefined) {
    patch.authorizedContactName = cleanText(input.authorizedContactName, 120);
  }
  if (input.authorizedContactPhone !== undefined) {
    patch.authorizedContactPhone = cleanText(input.authorizedContactPhone, 32);
  }

  const [row] = await db
    .update(companies)
    .set(patch)
    .where(eq(companies.id, companyId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
  return row;
}

/** Adds an authorised employer user to a company. Idempotent per user. */
export async function addCompanyMember(input: {
  companyId: string;
  userId: string;
  memberRole?: 'owner' | 'admin' | 'member';
  invitedByUserId: string;
}): Promise<EmployerCompanyMemberRow> {
  const { db } = dbFromRequest();

  const memberRole = input.memberRole ?? 'member';
  if (!['owner', 'admin', 'member'].includes(memberRole)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported company role.');
  }

  const [row] = await db
    .insert(employerCompanyMembers)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      memberRole,
      status: 'active',
      invitedByUserId: input.invitedByUserId,
    })
    .onConflictDoUpdate({
      target: [employerCompanyMembers.companyId, employerCompanyMembers.userId],
      set: { memberRole, status: 'active' },
    })
    .returning();

  return row;
}

/** Removes an employer user from a company. The owner cannot be removed. */
export async function removeCompanyMember(
  companyId: string,
  userId: string
): Promise<boolean> {
  const { db } = dbFromRequest();

  const [member] = await db
    .select({ memberRole: employerCompanyMembers.memberRole })
    .from(employerCompanyMembers)
    .where(
      and(
        eq(employerCompanyMembers.companyId, companyId),
        eq(employerCompanyMembers.userId, userId)
      )
    )
    .limit(1);
  if (!member) return false;
  if (member.memberRole === 'owner') {
    throw new AppError(
      AppErrorCode.CONFLICT,
      'The company owner cannot be removed.',
      409
    );
  }

  const removed = await db
    .delete(employerCompanyMembers)
    .where(
      and(
        eq(employerCompanyMembers.companyId, companyId),
        eq(employerCompanyMembers.userId, userId)
      )
    )
    .returning({ id: employerCompanyMembers.id });

  return removed.length > 0;
}

/** Members of a company, for the employer admin screen. */
export async function listCompanyMembers(companyId: string): Promise<
  Array<{ userId: string; memberRole: string; status: string; createdAt: string }>
> {
  const { db } = dbFromRequest();
  const rows = await db
    .select({
      userId: employerCompanyMembers.userId,
      memberRole: employerCompanyMembers.memberRole,
      status: employerCompanyMembers.status,
      createdAt: employerCompanyMembers.createdAt,
    })
    .from(employerCompanyMembers)
    .where(eq(employerCompanyMembers.companyId, companyId))
    .orderBy(desc(employerCompanyMembers.createdAt));

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Admin-only company verification decision. This is the ONLY path that can set
 * 'verified', and it always writes an audit entry.
 */
export async function setCompanyVerification(input: {
  companyId: string;
  status: 'verified' | 'rejected' | 'suspended';
  adminUserId: string;
  notes?: string | null;
}): Promise<CompanyRow> {
  const { db } = dbFromRequest();

  const [row] = await db
    .update(companies)
    .set({
      verificationStatus: input.status,
      verificationNotes: cleanText(input.notes, 1000),
      verifiedAt: input.status === 'verified' ? new Date() : null,
      verifiedByUserId: input.status === 'verified' ? input.adminUserId : null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, input.companyId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);

  await recordPortalAudit({
    action:
      input.status === 'verified'
        ? 'company_verification_granted'
        : input.status === 'rejected'
          ? 'company_verification_rejected'
          : 'company_suspended',
    actorUserId: input.adminUserId,
    description: `Company verification set to ${input.status}`,
    metadata: { companyId: input.companyId, status: input.status },
  });

  return row;
}

/** Companies for the admin verification queue. */
export async function listCompaniesForAdmin(
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<CompanyRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  return db
    .select()
    .from(companies)
    .where(options.status ? eq(companies.verificationStatus, options.status) : undefined)
    .orderBy(desc(companies.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));
}
