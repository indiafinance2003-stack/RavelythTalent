import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateProfiles,
  candidateSkills,
  categories,
  companies,
  jobAlerts,
  jobSkills,
  jobs,
  notifications,
  skills,
  users,
} from "@/lib/db/schema";
import { generateToken } from "@/lib/auth/crypto";
import { AppError } from "@/lib/errors";
import { getCandidateEntitlements } from "@/lib/entitlements";
import { getJobSkillNames, searchJobs } from "@/lib/jobs/queries";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { jobAlertEmail } from "@/lib/email/templates/product";
import { appUrl } from "@/lib/email/urls";
import {
  canSendDailyAlertEmail,
  isWeeklyAlertDay,
  jobAlertOptOutState,
  matchesJobAlert,
  mayEmailJobAlerts,
  type JobAlertMatchCriteria,
} from "./matching";

/** Job alerts: saved searches delivered by the daily/weekly cron. */

export const ALERT_MAX_FREE = 3;

export type AlertCriteria = {
  q?: string;
  location?: string;
  locations?: string[];
  category?: string;
  jobType?: string;
  workMode?: string;
  salaryMin?: number;
  roles?: string[];
  skills?: string[];
  source?: string;
};

async function profileAlertCriteria(userId: string): Promise<AlertCriteria> {
  const [profile] = await db
    .select({
      headline: candidateProfiles.headline,
      designation: candidateProfiles.currentDesignation,
      location: candidateProfiles.currentLocation,
      preferredLocations: candidateProfiles.preferredLocations,
      preferredRoles: candidateProfiles.preferredRoles,
      profileId: candidateProfiles.id,
    })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, userId))
    .limit(1);
  const skillRows = profile
    ? await db
        .select({ name: skills.name })
        .from(candidateSkills)
        .innerJoin(skills, eq(skills.id, candidateSkills.skillId))
        .where(eq(candidateSkills.candidateProfileId, profile.profileId))
    : [];
  const locations = (profile?.preferredLocations ?? []).filter(Boolean);
  if (locations.length === 0 && profile?.location) locations.push(profile.location);
  const roles = (profile?.preferredRoles ?? []).filter(Boolean);
  if (roles.length === 0 && profile?.designation) roles.push(profile.designation);
  return {
    source: "candidate_profile",
    q: profile?.headline || undefined,
    locations,
    roles,
    skills: skillRows.map((row) => row.name),
  };
}

/** Create or refresh the consented profile-based alert; no consent means no email alert. */
export async function syncDefaultProfileAlert(
  userId: string,
  options: { frequency?: "daily" | "weekly"; enable?: boolean } = {},
): Promise<void> {
  const [user] = await db
    .select({
      role: users.role,
      consent: users.jobAlertEmailConsent,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (
    !user ||
    user.role !== "job_seeker" ||
    user.status !== "active" ||
    user.deletedAt ||
    !user.consent
  ) return;

  const criteria = await profileAlertCriteria(userId);
  const existing = await db
    .select({ id: jobAlerts.id, frequency: jobAlerts.frequency, isActive: jobAlerts.isActive })
    .from(jobAlerts)
    .where(and(
      eq(jobAlerts.userId, userId),
      sql`${jobAlerts.criteria}->>'source' = 'candidate_profile'`,
    ))
    .limit(1);
  const current = existing[0];
  if (current) {
    await db
      .update(jobAlerts)
      .set({
        name: "Jobs matching my profile",
        criteria,
        frequency: options.frequency ?? current.frequency,
        ...(options.enable === undefined ? {} : { isActive: options.enable }),
        updatedAt: new Date(),
      })
      .where(eq(jobAlerts.id, current.id));
    return;
  }

  await db.insert(jobAlerts).values({
    userId,
    name: "Jobs matching my profile",
    criteria,
    frequency: options.frequency ?? "daily",
    isActive: true,
    unsubscribeToken: generateToken(24),
  });
}

export async function updateAlertPreferences(input: {
  userId: string;
  consent: boolean;
  frequency: "daily" | "weekly";
}): Promise<void> {
  await db
    .update(users)
    .set({ jobAlertEmailConsent: input.consent, updatedAt: new Date() })
    .where(eq(users.id, input.userId));
  if (input.consent) {
    await syncDefaultProfileAlert(input.userId, {
      frequency: input.frequency,
      enable: true,
    });
  }
}

export async function listAlerts(userId: string) {
  return db
    .select()
    .from(jobAlerts)
    .where(eq(jobAlerts.userId, userId))
    .orderBy(desc(jobAlerts.createdAt));
}

export async function createAlert(params: {
  userId: string;
  name: string;
  criteria: AlertCriteria;
  frequency: "daily" | "weekly";
}): Promise<string> {
  const features = await getCandidateEntitlements(params.userId);
  const limit = features.get("job_alerts")?.limit ?? ALERT_MAX_FREE;

  if (typeof limit === "number") {
    const existing = await listAlerts(params.userId);
    if (existing.length >= limit) {
      throw new AppError(
        `Your plan allows ${limit} job alert${limit === 1 ? "" : "s"}. Delete one or upgrade to add more.`,
        403,
        "alert_limit_reached",
      );
    }
  }

  const rows = await db
    .insert(jobAlerts)
    .values({
      userId: params.userId,
      name: params.name.trim().slice(0, 120) || "Job alert",
      criteria: params.criteria,
      frequency: params.frequency,
      unsubscribeToken: generateToken(24),
      isActive: true,
    })
    .returning({ id: jobAlerts.id });

  return rows[0]!.id;
}

export async function deleteAlert(userId: string, alertId: string): Promise<void> {
  await db
    .delete(jobAlerts)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)));
}

export async function toggleAlert(
  userId: string,
  alertId: string,
  isActive: boolean,
): Promise<void> {
  await db
    .update(jobAlerts)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)));
}

export async function updateAlert(
  userId: string,
  alertId: string,
  input: {
    name: string;
    criteria: AlertCriteria;
    frequency: "daily" | "weekly";
  },
): Promise<void> {
  const [existing] = await db
    .select({ criteria: jobAlerts.criteria })
    .from(jobAlerts)
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)))
    .limit(1);
  if (!existing) throw new AppError("Job alert not found.", 404, "alert_not_found");
  const oldCriteria = (existing.criteria ?? {}) as AlertCriteria;
  const updated = await db
    .update(jobAlerts)
    .set({
      name: input.name.trim().slice(0, 120) || "Job alert",
      criteria: {
        source: oldCriteria.source,
        roles: oldCriteria.roles,
        skills: oldCriteria.skills,
        q: input.criteria.q,
        location: input.criteria.location,
        locations: input.criteria.location ? [input.criteria.location] : [],
        category: input.criteria.category,
      },
      frequency: input.frequency,
      updatedAt: new Date(),
    })
    .where(and(eq(jobAlerts.id, alertId), eq(jobAlerts.userId, userId)))
    .returning({ id: jobAlerts.id });
  if (!updated.length) throw new AppError("Job alert not found.", 404, "alert_not_found");
}

/** Public unsubscribe: the token itself is the capability. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const rows = await db
    .select({ id: jobAlerts.id, userId: jobAlerts.userId })
    .from(jobAlerts)
    .where(eq(jobAlerts.unsubscribeToken, token))
    .limit(1);
  if (!rows.at(0)) return false;

  const optOut = jobAlertOptOutState();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ jobAlertEmailConsent: optOut.consent, updatedAt: new Date() })
      .where(eq(users.id, rows[0]!.userId));
    await tx
      .update(jobAlerts)
      .set({ isActive: optOut.active, updatedAt: new Date() })
      .where(eq(jobAlerts.userId, rows[0]!.userId));
  });
  return true;
}

export async function notifyMatchingCandidatesOfPublishedJob(
  jobId: string,
): Promise<number> {
  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      city: jobs.city,
      state: jobs.state,
      locations: jobs.locations,
      workMode: jobs.workMode,
      slug: jobs.slug,
      category: categories.slug,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(and(
      eq(jobs.id, jobId),
      eq(jobs.status, "published"),
      eq(companies.status, "approved"),
      isNull(jobs.deletedAt),
    ))
    .limit(1);
  if (!job) return 0;

  const jobSkillNames = await getJobSkillNames(job.id);
  const alertRows = await db
    .select({
      alertId: jobAlerts.id,
      userId: users.id,
      criteria: jobAlerts.criteria,
      isActive: jobAlerts.isActive,
    })
    .from(jobAlerts)
    .innerJoin(users, eq(users.id, jobAlerts.userId))
    .where(and(
      eq(jobAlerts.isActive, true),
      eq(users.role, "job_seeker"),
      eq(users.status, "active"),
      isNull(users.deletedAt),
    ));
  const matchingUsers = new Set<string>();
  for (const alert of alertRows) {
    if (matchesJobAlert(
      (alert.criteria ?? {}) as JobAlertMatchCriteria,
      {
        title: job.title,
        description: job.description,
        city: job.city,
        state: job.state,
        locations: (job.locations ?? []).map((location) => location),
        workMode: job.workMode,
        category: job.category,
        skills: jobSkillNames,
      },
    )) matchingUsers.add(alert.userId);
  }
  if (matchingUsers.size === 0) return 0;

  const existing = await db
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(
      eq(notifications.type, "job_alert_match"),
      inArray(notifications.userId, [...matchingUsers]),
      sql`${notifications.metadata}->>'jobId' = ${job.id}`,
    ));
  const alreadyNotified = new Set(existing.map((row) => row.userId));
  const newNotifications = [...matchingUsers]
    .filter((userId) => !alreadyNotified.has(userId))
    .map((userId) => ({
      userId,
      type: "job_alert_match",
      title: `New job matching your alert: ${job.title}`,
      body: job.city ? `A new role is available in ${job.city}.` : "A new role is available.",
      link: `/jobs/${job.slug}`,
      metadata: { jobId: job.id },
    }));
  if (newNotifications.length) await db.insert(notifications).values(newNotifications);
  return newNotifications.length;
}

export type AlertRunSummary = { alerts: number; emails: number; skipped: number };

async function claimDailyJobAlertEmail(userId: string, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        deletedAt: users.deletedAt,
        consent: users.jobAlertEmailConsent,
        lastSentAt: users.jobAlertLastEmailAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!user || !mayEmailJobAlerts({
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      deletedAt: user.deletedAt,
      jobAlertEmailConsent: user.consent,
    }) || !canSendDailyAlertEmail(user.lastSentAt, now)) return false;

    await tx
      .update(users)
      .set({ jobAlertLastEmailAt: now, updatedAt: now })
      .where(eq(users.id, userId));
    return true;
  });
}

/** Sends due alerts. Daily alerts run daily, weekly ones only on Mondays. */
export async function runJobAlerts(): Promise<AlertRunSummary> {
  const now = new Date();
  const due = await db
    .select({
      alert: jobAlerts,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      unsubscribeToken: jobAlerts.unsubscribeToken,
    })
    .from(jobAlerts)
    .innerJoin(users, eq(users.id, jobAlerts.userId))
    .where(and(
      eq(jobAlerts.isActive, true),
      eq(users.role, "job_seeker"),
      eq(users.status, "active"),
      eq(users.jobAlertEmailConsent, true),
      isNotNull(users.emailVerifiedAt),
      isNull(users.deletedAt),
    ));
  const summary: AlertRunSummary = { alerts: 0, emails: 0, skipped: 0 };
  type AlertEmailGroup = {
    email: string;
    fullName: string;
    alertIds: string[];
    alertNames: string[];
    frequencies: Set<"daily" | "weekly">;
    unsubscribeToken: string;
    jobs: Map<string, {
      title: string;
      companyName: string;
      city: string | null;
      url: string;
    }>;
    searchUrl: string;
  };
  const grouped = new Map<string, AlertEmailGroup>();

  for (const row of due) {
    const alert = row.alert;
    if (alert.frequency === "weekly" && !isWeeklyAlertDay(now)) {
      summary.skipped += 1;
      continue;
    }

    summary.alerts += 1;
    const criteria = (alert.criteria ?? {}) as AlertCriteria;
    const since =
      alert.lastSentAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await searchJobs({
      q: criteria.q,
      location: criteria.location ?? criteria.locations?.[0],
      category: criteria.category,
      jobType: criteria.jobType,
      workMode: criteria.workMode,
      salaryMin: criteria.salaryMin,
      sort: "newest",
      pageSize: 15,
    });

    let fresh = result.rows.filter(
      (job) => (job.publishedAt ?? job.createdAt).getTime() > since.getTime(),
    );
    if (criteria.skills?.length || criteria.roles?.length) {
      const skillRows = fresh.length
        ? await db
            .select({ jobId: jobSkills.jobId, name: skills.name })
            .from(jobSkills)
            .innerJoin(skills, eq(skills.id, jobSkills.skillId))
            .where(inArray(jobSkills.jobId, fresh.map((job) => job.id)))
        : [];
      const skillsByJob = new Map<string, string[]>();
      for (const skill of skillRows) {
        skillsByJob.set(skill.jobId, [...(skillsByJob.get(skill.jobId) ?? []), skill.name]);
      }
      fresh = fresh.filter((job) => matchesJobAlert(
        {
          roles: criteria.roles,
          skills: criteria.skills,
        },
        {
          title: job.title,
          city: job.city,
          workMode: job.workMode,
          skills: skillsByJob.get(job.id) ?? [],
        },
      ));
    }
    if (fresh.length === 0) {
      summary.skipped += 1;
      continue;
    }

    const searchParams = new URLSearchParams();
    if (criteria.q) searchParams.set("q", criteria.q);
    if (criteria.location) searchParams.set("location", criteria.location);
    if (criteria.category) searchParams.set("category", criteria.category);

    const group: AlertEmailGroup = grouped.get(row.userId) ?? {
      email: row.email,
      fullName: row.fullName,
      alertIds: [],
      alertNames: [],
      frequencies: new Set<"daily" | "weekly">(),
      unsubscribeToken: row.unsubscribeToken,
      jobs: new Map(),
      searchUrl: `${appUrl("/jobs")}?${searchParams.toString()}`,
    };
    group.alertIds.push(alert.id);
    group.alertNames.push(alert.name);
    group.frequencies.add(alert.frequency);
    for (const job of fresh) {
      group.jobs.set(job.id, {
        title: job.title,
        companyName: job.companyName,
        city: job.city,
        url: appUrl(`/jobs/${job.slug}`),
      });
    }
    grouped.set(row.userId, group);
  }

  for (const [userId, group] of grouped) {
    if (!(await claimDailyJobAlertEmail(userId, now))) {
      summary.skipped += group.alertIds.length;
      continue;
    }
    const brand = await getEmailBrand();
    const frequency = group.frequencies.has("daily") ? "daily" : "weekly";
    await queueRenderedEmail({
      to: group.email,
      toName: group.fullName,
      templateKey: "job_alert",
      rendered: jobAlertEmail({
        candidateName: group.fullName.split(" ")[0] ?? "there",
        alertName: group.alertNames.length === 1
          ? group.alertNames[0]!
          : "your profile and saved searches",
        frequency,
        jobs: [...group.jobs.values()],
        searchUrl: group.searchUrl,
        manageUrl: appUrl("/dashboard/alerts"),
        unsubscribeUrl: appUrl(`/api/alerts/unsubscribe?token=${group.unsubscribeToken}`),
        brand,
      }),
      metadata: { jobAlertUserId: userId, alertIds: group.alertIds },
    });

    await db
      .update(jobAlerts)
      .set({ lastSentAt: new Date(), updatedAt: new Date() })
      .where(inArray(jobAlerts.id, group.alertIds));

    summary.emails += 1;
  }

  return summary;
}
