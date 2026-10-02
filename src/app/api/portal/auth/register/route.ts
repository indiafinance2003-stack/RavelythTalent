import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { registerSchema } from '@/app/api/portal/schemas';
import { registerPortalUser } from '@/lib/auth/portal/register';
import { createSession } from '@/lib/auth/session';
import { sendEmailVerificationLink } from '@/lib/auth/email-verification';
import { recordConsent } from '@/lib/portal/consents';
import { clientIpForAudit } from '@/lib/portal/request-identity';
import {
  getRegisterRateLimiter,
  registerKey,
  checkAuthRateLimit,
} from '@/lib/auth/rate-limit';

/**
 * POST /api/portal/auth/register
 *
 * Creates a candidate or employer account.
 *
 * Flow: validate -> create the user (role from a CLOSED SET) -> create the
 * candidate profile or company -> open a session -> queue the verification
 * email -> record account-creation consent.
 *
 * The response deliberately does NOT claim the verification email was sent
 * unless a provider actually accepted it: `verification.emailDelivered` is
 * reported honestly so the frontend can show a resend prompt when needed.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      checkAuthRateLimit(
        getRegisterRateLimiter(),
        registerKey(req),
        'Too many registration attempts. Please try again later.'
      );

      const body = await readJsonBody(req);
      const input = parseWithSchema(registerSchema, body);

      const { user } = await registerPortalUser({
        name: input.name,
        email: input.email,
        password: input.password,
        role: input.accountType,
        company: input.company
          ? {
              name: input.company.name,
              website: input.company.website ?? null,
              industry: input.company.industry ?? null,
              companySize: input.company.companySize ?? null,
              location: input.company.location ?? null,
            }
          : undefined,
      });

      // The session is created BEFORE the email so a slow or unconfigured mail
      // provider can never block registration.
      await createSession(user.id);

      const verification = await sendEmailVerificationLink(user.email);

      // Consent is recorded ONLY for purposes the user affirmatively accepted.
      // Accepting the terms is NOT blanket consent: `marketing` is opt-in and is
      // never inferred from the act of registering.
      const ipAddress = clientIpForAudit(req);
      await recordConsent({
        userId: user.id,
        purpose: 'account_creation',
        policyVersion: 'v1',
        ipAddress,
      });

      const consents = input.consents ?? {};
      if (consents.jobApplication) {
        await recordConsent({
          userId: user.id,
          purpose: 'job_application',
          policyVersion: 'v1',
          ipAddress,
        });
      }
      if (consents.resumeStorage) {
        await recordConsent({
          userId: user.id,
          purpose: 'resume_storage',
          policyVersion: 'v1',
          ipAddress,
        });
      }
      if (consents.marketing) {
        await recordConsent({
          userId: user.id,
          purpose: 'marketing',
          policyVersion: 'v1',
          ipAddress,
        });
      }

      return {
        user,
        verification: {
          requested: verification.requested,
          // Honest: false means no provider is configured yet.
          emailDelivered: verification.emailDelivered,
        },
      };
    },
    // 201 Created
    () => 201
  );
}

