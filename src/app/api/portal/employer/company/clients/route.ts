import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireEmployerUser } from '@/lib/portal/auth-context';
import {
  addAgencyClient,
  listAgencyClients,
  revokeAgencyClient,
} from '@/lib/portal/agencies';
import { getEmployerCompany } from '@/lib/portal/employers/company';

const linkSchema = z
  .object({ clientCompanyId: z.string().uuid() })
  .strict();

/**
 * GET    /api/portal/employer/company/clients - clients this agency may post for
 * POST   /api/portal/employer/company/clients - authorise a client
 * DELETE /api/portal/employer/company/clients - revoke a client
 *
 * The agency is resolved from the SESSION, so this endpoint can only ever
 * manage links belonging to the caller's own company.
 *
 * Only a company whose type is `recruitment_agency` can hold clients. A direct
 * employer receives 403 rather than a silently empty list, so the distinction
 * between the two account kinds is enforced rather than merely documented.
 *
 * This grants PUBLISHING authority only. It does not create a login or any
 * dashboard access for the client company.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requireEmployerUser();
    const resolved = await getEmployerCompany(user.id);

    if (!resolved) {
      return { companyType: null, clients: [] };
    }

    return {
      companyType: resolved.company.companyType,
      clients: await listAgencyClients(resolved.company.id),
    };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requireEmployerUser();
    const resolved = await getEmployerCompany(user.id);

    if (!resolved) {
      throw new Error('No company is linked to this account yet.');
    }

    const body = await readJsonBody(req);
    const input = parseWithSchema(linkSchema, body);

    // Authorisation is validated in the service, which refuses a non-agency.
    await addAgencyClient({
      agencyCompanyId: resolved.company.id,
      clientCompanyId: input.clientCompanyId,
      actorUserId: user.id,
    });

    return { clients: await listAgencyClients(resolved.company.id) };
  });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requireEmployerUser();
    const resolved = await getEmployerCompany(user.id);

    if (!resolved) {
      throw new Error('No company is linked to this account yet.');
    }

    const body = await readJsonBody(req);
    const input = parseWithSchema(linkSchema, body);

    // Revoking is reported honestly rather than assumed to have happened.
    const revoked = await revokeAgencyClient({
      agencyCompanyId: resolved.company.id,
      clientCompanyId: input.clientCompanyId,
      actorUserId: user.id,
    });

    return { revoked, clients: await listAgencyClients(resolved.company.id) };
  });
}
