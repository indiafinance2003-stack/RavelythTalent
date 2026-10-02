import 'server-only';
import { and, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import { users } from '@/lib/db/schema';
import {
  candidateProfiles,
  companies,
  employerProfiles,
  jobApplications,
  jobs,
} from '@/lib/db/portal-schema';
import {
  sendApplicationSubmitted,
  sendNewApplication,
} from '@/lib/email/transactional/dispatch';
import { logger } from '@/lib/logging/logger';

/**
 * Application event notifications.
 *
 * Kept out of the route handler so the "what happens after an application is
 * recorded" logic lives in one place. Two rules apply:
 *
 *  - These run AFTER the application is committed. A mail failure is logged and
 *    swallowed: an employer being unable to receive an email must never undo a
 *    candidate's application or fail the request.
 *  - Delivery is never claimed. The send helpers return `{ delivered: false }`
 *    when no provider is configured, which is left to the operational log.
 */

/** Notifies the applicant and the employer that received the application. */
export async function notifyApplicationSubmitted(input: {
  applicationId: string;
}): Promise<void> {
  try {
    const { db } = dbFromRequest();

    // One query resolves the application together with its candidate and job.
    const [context] = await db
      .select({
        fullName: candidateProfiles.fullName,
        candidateUserId: candidateProfiles.userId,
        title: jobs.title,
        companyId: jobs.companyId,
      })
      .from(jobApplications)
      .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
      .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
      .where(eq(jobApplications.id, input.applicationId))
      .limit(1);

    if (!context) return;

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, context.companyId))
      .limit(1);

    const [candidate] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, context.candidateUserId))
      .limit(1);

    if (candidate) {
      await sendApplicationSubmitted({
        to: candidate.email,
        candidateName: context.fullName,
        jobTitle: context.title,
        companyName: company?.name ?? '',
      });
    }

    // The employer's primary contact is notified, if one is recorded.
    const [employerContact] = await db
      .select({ email: users.email, name: users.name })
      .from(employerProfiles)
      .innerJoin(users, eq(employerProfiles.userId, users.id))
      .where(
        and(
          eq(employerProfiles.companyId, context.companyId),
          eq(employerProfiles.isPrimaryContact, true)
        )
      )
      .limit(1);

    if (employerContact) {
      await sendNewApplication({
        to: employerContact.email,
        employerName: employerContact.name,
        candidateName: context.fullName,
        jobTitle: context.title,
        dashboardPath: `/employer/applications/${input.applicationId}`,
      });
    }
  } catch (error) {
    // Notifications are secondary: never fail the application itself.
    logger.error('Application notification failed', {
      applicationId: input.applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

