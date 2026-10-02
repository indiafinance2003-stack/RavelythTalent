import 'server-only';
import { eq } from 'drizzle-orm';
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
  sendApplicationStatusChanged,
  sendApplicationSubmitted,
  sendJobApproved,
  sendJobRejected,
  sendNewApplication,
} from '@/lib/email/transactional/dispatch';
import { logger } from '@/lib/logging/logger';
import { safeCreateNotification } from '@/lib/notifications/notifications';

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

    // In-app first: it is the durable record the user can always come back to.
    await safeCreateNotification({
      userId: context.candidateUserId,
      type: 'application_submitted',
      title: 'Application sent',
      body: `Your application for "${context.title}" was sent to "${company?.name ?? 'the employer'}".`,
      link: '/candidate/applications',
    });

    if (candidate) {
      await sendApplicationSubmitted({
        to: candidate.email,
        candidateName: context.fullName,
        jobTitle: context.title,
        companyName: company?.name ?? '',
      });
    }

    // Everyone who works at the company is notified in-app, because an
    // application must not be invisible merely because nobody ticked
    // "primary contact". Email is sent to the primary contact when one exists.
    const recipients = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isPrimary: employerProfiles.isPrimaryContact,
      })
      .from(employerProfiles)
      .innerJoin(users, eq(employerProfiles.userId, users.id))
      .where(eq(employerProfiles.companyId, context.companyId));

    for (const recipient of recipients) {
      await safeCreateNotification({
        userId: recipient.id,
        type: 'new_application_received',
        title: 'New application received',
        body: `${context.fullName} applied for "${context.title}".`,
        link: `/employer/applications/${input.applicationId}`,
      });
    }

    const employerContact =
      recipients.find((recipient) => recipient.isPrimary) ?? recipients[0];

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


/**
 * Notifies a candidate that an employer moved their application.
 *
 * Same contract as the submitted notification: runs after the status change has
 * committed, swallows and logs failures, and never claims delivery it did not
 * achieve.
 */
export async function notifyApplicationStatusChanged(input: {
  applicationId: string;
}): Promise<void> {
  try {
    const { db } = dbFromRequest();

    const [context] = await db
      .select({
        candidateEmail: users.email,
        candidateUserId: users.id,
        candidateName: candidateProfiles.fullName,
        jobTitle: jobs.title,
        status: jobApplications.status,
        companyId: jobs.companyId,
      })
      .from(jobApplications)
      .innerJoin(candidateProfiles, eq(jobApplications.candidateId, candidateProfiles.id))
      .innerJoin(users, eq(candidateProfiles.userId, users.id))
      .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
      .where(eq(jobApplications.id, input.applicationId))
      .limit(1);

    if (!context) return;

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, context.companyId))
      .limit(1);

    const statusLabel = humanizeStatus(context.status);

    await safeCreateNotification({
      userId: context.candidateUserId,
      type: 'application_status_changed',
      title: `Application ${statusLabel.toLowerCase()}`,
      body: `Your application for "${context.jobTitle}" is now ${statusLabel.toLowerCase()}.`,
      link: '/candidate/applications',
    });

    await sendApplicationStatusChanged({
      to: context.candidateEmail,
      candidateName: context.candidateName,
      jobTitle: context.jobTitle,
      companyName: company?.name ?? '',
      statusLabel,
    });
  } catch (error) {
    logger.error('Application status notification failed', {
      applicationId: input.applicationId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Turns `shortlisted` into `Shortlisted` for display in an email. */
function humanizeStatus(status: string): string {
  const spaced = status.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Notifies an employer of an admin's decision on one of their job postings.
 *
 * Runs after the decision has committed and never fails it: a moderation mail
 * outage must not roll back or block an approval that already happened.
 */
export async function notifyJobDecision(input: {
  jobId: string;
  approved: boolean;
  rejectionReason?: string | null;
}): Promise<void> {
  try {
    const { db } = dbFromRequest();

    const [context] = await db
      .select({
        title: jobs.title,
        companyId: jobs.companyId,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId))
      .limit(1);

    if (!context) return;

    // Same rule as applications: notify every company member in-app, and
    // email the primary contact when one is designated.
    const recipients = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isPrimary: employerProfiles.isPrimaryContact,
      })
      .from(employerProfiles)
      .innerJoin(users, eq(employerProfiles.userId, users.id))
      .where(eq(employerProfiles.companyId, context.companyId));

    const contact = recipients.find((recipient) => recipient.isPrimary) ?? recipients[0];

    if (!contact) return;
    if (!contact) return;

    const dashboardPath = `/employer/jobs/${input.jobId}`;

    if (input.approved) {
      await safeCreateNotification({
        userId: contact.id,
        type: 'job_approved',
        title: 'Job posting approved',
        body: `"${context.title}" is now live on the portal.`,
        link: dashboardPath,
      });

      await sendJobApproved({
        to: contact.email,
        employerName: contact.name,
        jobTitle: context.title,
        dashboardPath,
      });
      return;
    }

    await safeCreateNotification({
      userId: contact.id,
      type: 'job_rejected',
      title: 'Job posting needs changes',
      body: `"${context.title}" was not approved. Review the reason and resubmit.`,
      link: dashboardPath,
    });

    await sendJobRejected({
      to: contact.email,
      employerName: contact.name,
      jobTitle: context.title,
      rejectionReason: input.rejectionReason ?? null,
      dashboardPath,
    });
  } catch (error) {
    logger.error('Job decision notification failed', {
      jobId: input.jobId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }
}