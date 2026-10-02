import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireEmployerUser } from '@/lib/portal/auth-context';
import {
  getEmployerCompany,
  listCompanyMembers,
  updateCompany,
} from '@/lib/portal/employers/company';

const updateSchema = z
  .object({
    name: z.string().min(1).max(160).optional(),
    website: z.string().max(300).nullish(),
    industry: z.string().max(80).nullish(),
    companySize: z.string().max(40).nullish(),
    location: z.string().max(120).nullish(),
    description: z.string().max(4000).nullish(),
    phone: z.string().max(32).nullish(),
    officialEmail: z.string().max(254).nullish(),
    authorizedContactName: z.string().max(120).nullish(),
    authorizedContactPhone: z.string().max(32).nullish(),
  })
  .strict();

/**
 * GET   /api/portal/employer/company - the caller's own company + members
 * PATCH /api/portal/employer/company - edit its public details
 *
 * The company is resolved from the SESSION, never from a body or query id, so
 * this endpoint can only ever read or write the caller's own company record.
 *
 * `verificationStatus` is deliberately absent from the update schema: an
 * employer verifying itself would defeat the entire verification feature. That
 * field is settable only through the admin route.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requireEmployerUser();
    const resolved = await getEmployerCompany(user.id);

    if (!resolved) {
      return { company: null, memberRole: null, members: [] };
    }

    return {
      company: resolved.company,
      memberRole: resolved.memberRole,
      members: await listCompanyMembers(resolved.company.id),
    };
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requireEmployerUser();
    const resolved = await getEmployerCompany(user.id);

    if (!resolved) {
      // No company linked yet, so there is nothing to edit.
      return { company: null };
    }

    const body = await readJsonBody(req);
    const input = parseWithSchema(updateSchema, body);

    // Any change to a company's identity details invalidates a prior
    // verification decision, so the company returns to pending for an admin.
    const company = await updateCompany(resolved.company.id, input);

    return { company };
  });
}
