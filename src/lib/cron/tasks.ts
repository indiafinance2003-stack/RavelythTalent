import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailVerificationTokens,
  jobs,
  otpCodes,
  passwordResetTokens,
  subscriptions,
  users,
} from "@/lib/db/schema";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { purgeRateLimits } from "@/lib/rate-limit";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  subscriptionExpiredEmail,
  subscriptionExpiringSoonEmail,
} from "@/lib/email/templates/billing";
import { plans } from "@/lib/db/schema";
import { runJobAlerts, type AlertRunSummary } from "@/lib/alerts/service";
import { appUrl } from "@/lib/email/urls";
import { formatDate } from "@/lib/utils";

/** Background jobs driven by /api/internal/cron/* (see deploy/systemd). */

export type CronResult = Record<string, unknown>;

const firstName = (fullName: string) => fullName.split(" ")[0] ?? "there";

async function findUser(userId: string) {
  const rows = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

async function planName(planId: string): Promise<string> {
  const rows = await db
    .select({ name: plans.name })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  return rows.at(0)?.name ?? "your plan";
}

export async function runSubscriptionExpiryAndReminders(): Promise<CronResult> {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in1 = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  let reminders7d = 0;
  let reminders1d = 0;
  let expired = 0;

  const active = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));

  for (const subscription of active) {
    const end = subscription.currentPeriodEnd;

    if (end <= now) {
      await db
        .update(subscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));

      const user = await findUser(subscription.userId);
      if (user && !subscription.expiredEmailSentAt) {
        const brand = await getEmailBrand();
        await queueRenderedEmail({
          to: user.email,
          toName: user.fullName,
          templateKey: "subscription_expired",
          rendered: subscriptionExpiredEmail({
            name: firstName(user.fullName),
            planName: await planName(subscription.planId),
            endedOn: formatDate(end),
            renewUrl: appUrl(
              subscription.companyId ? "/pricing?audience=employer" : "/pricing",
            ),
            brand,
          }),
          metadata: { subscriptionId: subscription.id },
        });
        await db
          .update(subscriptions)
          .set({ expiredEmailSentAt: new Date() })
          .where(eq(subscriptions.id, subscription.id));
      }
      expired += 1;
      continue;
    }

    const user = await findUser(subscription.userId);
    if (!user) continue;
    const brand = await getEmailBrand();
    const daysLeft = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 86400000));
    const name = await planName(subscription.planId);
    const renewUrl = appUrl(
      subscription.companyId ? "/pricing?audience=employer" : "/pricing",
    );

    if (end <= in7 && !subscription.reminder7dSentAt) {
      await queueRenderedEmail({
        to: user.email,
        toName: user.fullName,
        templateKey: "subscription_expiring_7d",
        rendered: subscriptionExpiringSoonEmail({
          name: firstName(user.fullName),
          planName: name,
          daysLeft,
          endsOn: formatDate(end),
          renewUrl,
          brand,
        }),
        metadata: { subscriptionId: subscription.id },
      });
      await db
        .update(subscriptions)
        .set({ reminder7dSentAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));
      reminders7d += 1;
    }

    if (end <= in1 && !subscription.reminder1dSentAt) {
      await queueRenderedEmail({
        to: user.email,
        toName: user.fullName,
        templateKey: "subscription_expiring_1d",
        rendered: subscriptionExpiringSoonEmail({
          name: firstName(user.fullName),
          planName: name,
          daysLeft: 1,
          endsOn: formatDate(end),
          renewUrl,
          brand,
        }),
        metadata: { subscriptionId: subscription.id },
      });
      await db
        .update(subscriptions)
        .set({ reminder1dSentAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));
      reminders1d += 1;
    }
  }

  return { active: active.length, expired, reminders7d, reminders1d };
}

/** Closes published jobs whose deadline has passed. */
export async function expireJobs(): Promise<CronResult> {
  const rows = await db
    .update(jobs)
    .set({ status: "expired", updatedAt: new Date() })
    .where(
      and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        sql`${jobs.expiresAt} is not null`,
        lt(jobs.expiresAt, new Date()),
      ),
    )
    .returning({ id: jobs.id });

  return { expired: rows.length };
}

/** Housekeeping: expired tokens, sessions, OTPs and rate-limit buckets. */
export async function cleanupExpiredData(): Promise<CronResult> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [verification, reset, otp, sessionCount, rateCount] = await Promise.all([
    db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, dayAgo))
      .returning({ id: emailVerificationTokens.id }),
    db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, dayAgo))
      .returning({ id: passwordResetTokens.id }),
    db
      .delete(otpCodes)
      .where(lt(otpCodes.expiresAt, dayAgo))
      .returning({ id: otpCodes.id }),
    deleteExpiredSessions(),
    purgeRateLimits(),
  ]);

  return {
    emailVerificationTokens: verification.length,
    passwordResetTokens: reset.length,
    otpCodes: otp.length,
    sessions: sessionCount,
    rateLimits: rateCount,
  };
}

export async function sendJobAlertEmails(): Promise<AlertRunSummary> {
  return runJobAlerts();
}
