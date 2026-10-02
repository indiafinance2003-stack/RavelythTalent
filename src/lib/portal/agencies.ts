import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  companies,
  companyClientRelationships,
  type CompanyRow,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';

/**
 * Recruitment agencies (staffing companies).
 *
 * A staffing firm is a legitimate way for a vacancy to reach the portal, but it
 * must stay DISTINCT from a direct employer in two ways:
 *
 *  1. IDENTITY. `companies.company_type` records which one it is. A direct
 *     employer hires for itself; an agency publishes for a client.
 *  2. AUTHORISATION. An agency may only publish for a client linked in
 *     `company_client_relationships`. Without that link it could name any company
 *     as a client and publish vacancies in its name, which is impersonation.
 *
 * Billing and moderation deliberately do NOT change: `jobs.company_id` always
 * remains the agency, so credits, approval and tenant scoping behave exactly as
 * for a direct employer. Only `postedForCompanyId` records whose vacancy it is.
 */

/** Company types an employer account may hold. */
export const COMPANY_TYPES = ['employer', 'recruitment_agency'] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

function assertCompanyType(value: string): asserts value is CompanyType {
  if (!(COMPANY_TYPES as readonly string[]).includes(value)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, `Unsupported company type: ${value}`);
  }
}

/**
 * Authorises an agency to publish for a client.
 *
 * Returns the resolved client company, or throws 403. All three conditions must
 * hold: the poster really is a recruitment agency, it is active, and the client
 * link exists and has not been revoked.
 */
export async function requireAgencyClientAccess(input: {
  agencyCompanyId: string;
  clientCompanyId: string;
}): Promise<CompanyRow> {
  if (input.agencyCompanyId === input.clientCompanyId) {
    // A direct employer posts under its own name; that path must not set this.
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'A company cannot act as its own recruitment client.',
      400
    );
  }

  const { db } = dbFromRequest();

  const [agency] = await db
    .select({ id: companies.id, type: companies.companyType, status: companies.status })
    .from(companies)
    .where(eq(companies.id, input.agencyCompanyId))
    .limit(1);

  if (!agency) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
  }
  assertCompanyType(agency.type);

  // A direct employer is not an agency, no matter what it claims.
  if (agency.type !== 'recruitment_agency') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'Only a verified recruitment agency can post vacancies on behalf of a client company.',
      403
    );
  }

  if (agency.status !== 'active') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This agency account is suspended and cannot post jobs.',
      403
    );
  }

  const [client] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, input.clientCompanyId))
    .limit(1);

  if (!client) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested client company was not found.', 404);
  }

  // A client must be able to see who is recruiting for it.
  if (client.status !== 'active') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'The client company account is suspended.',
      403
    );
  }

  const [link] = await db
    .select({ id: companyClientRelationships.id })
    .from(companyClientRelationships)
    .where(
      and(
        eq(companyClientRelationships.agencyCompanyId, input.agencyCompanyId),
        eq(companyClientRelationships.clientCompanyId, input.clientCompanyId),
        eq(companyClientRelationships.status, 'active')
      )
    )
    .limit(1);

  if (!link) {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'This agency is not authorised to post vacancies for that client company.',
      403
    );
  }

  return client;
}

/** Links a client to an agency. Idempotent: re-linking revives a revoked row. */
export async function addAgencyClient(input: {
  agencyCompanyId: string;
  clientCompanyId: string;
  actorUserId: string;
}): Promise<{ id: string; status: string }> {
  if (input.agencyCompanyId === input.clientCompanyId) {
    throw new AppError(
      AppErrorCode.VALIDATION_ERROR,
      'A company cannot be registered as its own client.',
      400
    );
  }

  const { db } = dbFromRequest();

  const [agency] = await db
    .select({ type: companies.companyType })
    .from(companies)
    .where(eq(companies.id, input.agencyCompanyId))
    .limit(1);

  if (!agency) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);
  }
  assertCompanyType(agency.type);

  if (agency.type !== 'recruitment_agency') {
    throw new AppError(
      AppErrorCode.FORBIDDEN,
      'Only a recruitment agency can be given client companies.',
      403
    );
  }

  const [client] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, input.clientCompanyId))
    .limit(1);

  if (!client) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested client company was not found.', 404);
  }

  const now = new Date();

  // ON CONFLICT re-activates rather than erroring, so an agency can restore a
  // client it had revoked without accumulating duplicate authorisation rows.
  const [row] = await db
    .insert(companyClientRelationships)
    .values({
      agencyCompanyId: input.agencyCompanyId,
      clientCompanyId: input.clientCompanyId,
      status: 'active',
      createdByUserId: input.actorUserId,
      revokedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        companyClientRelationships.agencyCompanyId,
        companyClientRelationships.clientCompanyId,
      ],
      set: { status: 'active', revokedAt: null, updatedAt: now },
    })
    .returning({
      id: companyClientRelationships.id,
      status: companyClientRelationships.status,
    });

  await recordPortalAudit({
    action: 'agency_client_linked',
    actorUserId: input.actorUserId,
    description: 'Recruitment agency authorised to post for a client company',
    metadata: {
      agencyCompanyId: input.agencyCompanyId,
      clientCompanyId: input.clientCompanyId,
    },
  });

  return row;
}

/** Revokes an agency's authority to post for a client. Idempotent. */
export async function revokeAgencyClient(input: {
  agencyCompanyId: string;
  clientCompanyId: string;
  actorUserId: string;
}): Promise<boolean> {
  const { db } = dbFromRequest();

  const revoked = await db
    .update(companyClientRelationships)
    .set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(companyClientRelationships.agencyCompanyId, input.agencyCompanyId),
        eq(companyClientRelationships.clientCompanyId, input.clientCompanyId)
      )
    )
    .returning({ id: companyClientRelationships.id });

  if (revoked.length > 0) {
    await recordPortalAudit({
      action: 'agency_client_revoked',
      actorUserId: input.actorUserId,
      description: 'Agency authority to post for a client revoked',
      metadata: {
        agencyCompanyId: input.agencyCompanyId,
        clientCompanyId: input.clientCompanyId,
      },
    });
  }

  return revoked.length > 0;
}

/** Clients an agency may post for. */
export async function listAgencyClients(
  agencyCompanyId: string
): Promise<
  Array<{ id: string; clientCompanyId: string; name: string; status: string; verified: boolean }>
> {
  const { db } = dbFromRequest();

  const rows = await db
    .select({
      id: companyClientRelationships.id,
      clientCompanyId: companyClientRelationships.clientCompanyId,
      status: companyClientRelationships.status,
      name: companies.name,
      verificationStatus: companies.verificationStatus,
    })
    .from(companyClientRelationships)
    .innerJoin(companies, eq(companyClientRelationships.clientCompanyId, companies.id))
    .where(eq(companyClientRelationships.agencyCompanyId, agencyCompanyId))
    .orderBy(companies.name);

  return rows.map((row) => ({
    id: row.id,
    clientCompanyId: row.clientCompanyId,
    name: row.name,
    status: row.status,
    verified: row.verificationStatus === 'verified',
  }));
}

/**
 * Admin-only: reclassifies a company as an employer or a recruitment agency.
 *
 * Separate from `updateCompany` so an employer can never reclassify ITSELF into
 * an agency and start posting for other companies.
 */
export async function setCompanyType(input: {
  companyId: string;
  companyType: string;
  adminUserId: string;
}): Promise<CompanyRow> {
  assertCompanyType(input.companyType);
  const { db } = dbFromRequest();

  const [row] = await db
    .update(companies)
    .set({ companyType: input.companyType, updatedAt: new Date() })
    .where(eq(companies.id, input.companyId))
    .returning();

  if (!row) throw new AppError(AppErrorCode.NOT_FOUND, 'The requested company was not found.', 404);

  // Reclassifying away from an agency must not leave live authorisations behind.
  if (input.companyType === 'employer') {
    await db.execute(
      sql`UPDATE company_client_relationships
             SET status = 'revoked', revoked_at = now(), updated_at = now()
           WHERE agency_company_id = ${input.companyId}
             AND status = 'active'`
    );
  }

  await recordPortalAudit({
    action: 'company_type_changed',
    actorUserId: input.adminUserId,
    description: `Company type set to ${input.companyType}`,
    metadata: { companyId: input.companyId, companyType: input.companyType },
  });

  return row;
}
