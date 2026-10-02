import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requirePortalUser } from '@/lib/portal/auth-context';
import {
  hasConsent,
  listConsents,
  recordConsent,
  withdrawConsent,
} from '@/lib/portal/consents';
import { CONSENT_PURPOSES } from '@/lib/db/portal-schema';
import { clientIpForAudit } from '@/lib/portal/request-identity';
import { ValidationError } from '@/lib/errors/app-error';

const grantSchema = z
  .object({
    purpose: z.enum(CONSENT_PURPOSES as unknown as [string, ...string[]]),
    policyVersion: z.string().min(1).max(40).optional(),
  })
  .strict();

const withdrawSchema = z
  .object({ purpose: z.enum(CONSENT_PURPOSES as unknown as [string, ...string[]]) })
  .strict();

/**
 * GET    /api/portal/candidate/consent - the caller's full consent history
 * POST   /api/portal/candidate/consent - grant one purpose
 * DELETE /api/portal/candidate/consent - withdraw one purpose
 *
 * Purposes are INDEPENDENT. Withdrawing `marketing` never touches
 * `job_application`, which is what stops a narrow opt-out from either silently
 * dropping an unrelated purpose or being impossible to perform.
 *
 * `account_creation` cannot be withdrawn here: the account itself is what carries
 * that consent, so ending the relationship means deleting or closing the
 * account, not pretending the historical record never existed.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requirePortalUser();
    return {
      consents: await listConsents(user.id),
      purposes: CONSENT_PURPOSES,
    };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requirePortalUser();
    const body = await readJsonBody(req);
    const input = parseWithSchema(grantSchema, body);

    if (input.purpose === 'account_creation') {
      throw new ValidationError('Account creation consent is recorded at registration.');
    }

    const consent = await recordConsent({
      userId: user.id,
      purpose: input.purpose as never,
      policyVersion: input.policyVersion ?? 'v1',
      ipAddress: clientIpForAudit(req),
    });

    return { consent };
  });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const user = await requirePortalUser();
    const body = await readJsonBody(req);
    const input = parseWithSchema(withdrawSchema, body);

    if (input.purpose === 'account_creation') {
      throw new ValidationError(
        'Account creation consent cannot be withdrawn. Close or delete the account instead.'
      );
    }

    const withdrawn = await withdrawConsent(user.id, input.purpose as never);

    // The response reports the resulting STATE rather than assuming success, so
    // a repeat withdrawal is visibly a no-op instead of a silent lie.
    return {
      withdrawn,
      purpose: input.purpose,
      currentlyGranted: await hasConsent(user.id, input.purpose as never),
    };
  });
}
