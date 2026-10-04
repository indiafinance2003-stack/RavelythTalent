import 'server-only';
import { eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { candidateProfiles, employerProfiles } from '@/lib/db/portal-schema';
import type { PortalUser } from '@/lib/portal/authz';
import type { ResumeAccessContext } from './resumes';

/**
 * Derives a resume read's capabilities from the SESSION role alone.
 *
 * This is the single place that turns a signed-in user into a
 * `ResumeAccessContext`, so the uploaded-file endpoint and the generated-PDF
 * endpoint cannot drift apart on who is allowed to read what. Both are the most
 * sensitive reads on the platform: a divergence between them would mean an
 * employer could read a candidate's private draft simply by asking for the PDF
 * instead of the source document.
 *
 * NOTHING HERE READS AN ID FROM THE REQUEST. The user id comes from the verified
 * session and the candidate/company ids are looked up from it, so no endpoint
 * using this can be talked into acting on someone else's behalf.
 */
export async function resolveResumeAccessContext(user: PortalUser): Promise<ResumeAccessContext> {
  if (user.role === 'admin') {
    return { adminUserId: user.id };
  }

  const { db } = dbFromRequest();

  if (user.role === 'candidate') {
    const [profile] = await db
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, user.id))
      .limit(1);

    // NOTE: `noUncheckedIndexedAccess` is off in this project, so a destructured
    // row types as `T` even though it is `undefined` at runtime when the query
    // matched nothing. `?? undefined` is therefore load-bearing — it keeps the
    // field genuinely absent instead of smuggling a `null` into a `string`.
    // A candidate with no profile simply matches nothing in `decideAccess`.
    return { candidateProfileId: profile?.id ?? undefined };
  }

  const [employer] = await db
    .select({ companyId: employerProfiles.companyId })
    .from(employerProfiles)
    .where(eq(employerProfiles.userId, user.id))
    .limit(1);

  // No linked company means no company scope, so no employer access at all.
  return {
    employerUserId: user.id,
    companyId: employer?.companyId ?? undefined,
  };
}
