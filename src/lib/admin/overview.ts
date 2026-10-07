import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsage,
  assistantSettings,
  auditLogs,
  campaignMessages,
  categories,
  companies,
  companyLeads,
  inboxThreads,
  jobReports,
  jobs,
  payments,
  socialPosts,
  subscriptions,
  users,
  whatsappDigests,
} from "@/lib/db/schema";
import {
  addIstDays,
  istDateKey,
  startOfIstDay,
  startOfIstMonth,
  startOfIstMonthBack,
} from "@/lib/dashboard/ist";
import {
  collapseSeries,
  fillDailySeries,
  fillMonthlySeries,
  type SeriesPoint,
} from "@/lib/dashboard/series";
import {
  getMailAccountStatuses,
  type InboxAccountStatus,
} from "@/lib/assistant/mail-accounts";
import {
  getSocialConnectionStatuses,
  getSocialSettings,
  type SocialConnectionStatus,
} from "@/lib/social/settings";

/* -------------------------------------------------------------------------- */
/* KPIs                                                                        */
/* -------------------------------------------------------------------------- */

export type AdminKpis = {
  registeredUsers: number;
  pendingCompanies: number;
  liveJobs: number;
  activeSubscriptions: number;
  revenueThisMonthPaise: number;
  revenueLastMonthPaise: number;
  openReports: number;
};

export async function getAdminKpis(now = new Date()): Promise<AdminKpis> {
  const revenue = await getRevenueByMonth(2, now);
  const [
    usersRow,
    companiesRow,
    jobsRow,
    subscriptionsRow,
    reportsRow,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(companies)
      .where(and(eq(companies.status, "pending"), isNull(companies.deletedAt))),
    db
      .select({ value: count() })
      .from(jobs)
      .where(and(eq(jobs.status, "published"), isNull(jobs.deletedAt))),
    db
      .select({ value: count() })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.status, "active"), sql`${subscriptions.currentPeriodEnd} > ${now}`),
      ),
    db.select({ value: count() }).from(jobReports).where(eq(jobReports.status, "open")),
  ]);

  return {
    registeredUsers: usersRow[0]?.value ?? 0,
    pendingCompanies: companiesRow[0]?.value ?? 0,
    liveJobs: jobsRow[0]?.value ?? 0,
    activeSubscriptions: subscriptionsRow[0]?.value ?? 0,
    revenueThisMonthPaise: revenue.at(-1)?.value ?? 0,
    revenueLastMonthPaise: revenue[0]?.value ?? 0,
    openReports: reportsRow[0]?.value ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Chart series (real data, zero-filled so charts never invent values)         */
/* -------------------------------------------------------------------------- */

/** Captured payments grouped by IST calendar month, oldest month first. */
export async function getRevenueByMonth(
  months = 12,
  now = new Date(),
): Promise<SeriesPoint[]> {
  const start = startOfIstMonthBack(now, months - 1);
  const rows = await db
    .select({
      key: sql<string>`to_char(date_trunc('month', ${payments.createdAt} at time zone 'Asia/Kolkata'), 'YYYY-MM')`,
      paise: sql<string>`coalesce(sum(${payments.amountPaise}), 0)::text`,
    })
    .from(payments)
    .where(and(eq(payments.status, "captured"), gte(payments.createdAt, start)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const values: Record<string, number> = {};
  for (const row of rows) values[row.key] = Number(row.paise);
  return fillMonthlySeries(months, now, values);
}

/** New registrations per IST day, oldest day first. */
export async function getSignupSeries(
  days = 30,
  now = new Date(),
): Promise<SeriesPoint[]> {
  const start = startOfIstDay(addIstDays(now, -(days - 1)));
  const rows = await db
    .select({
      key: sql<string>`to_char(${users.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(users)
    .where(gte(users.createdAt, start))
    .groupBy(sql`1`);

  const values: Record<string, number> = {};
  for (const row of rows) values[row.key] = row.value;
  return fillDailySeries(days, now, values);
}

/** Published jobs per category (top `limit`, remainder collapsed to "Other"). */
export async function getJobsByCategory(limit = 6): Promise<SeriesPoint[]> {
  const rows = await db
    .select({
      label: sql<string>`coalesce(${categories.name}, 'Uncategorised')`,
      value: count(),
    })
    .from(jobs)
    .leftJoin(categories, eq(jobs.categoryId, categories.id))
    .where(and(eq(jobs.status, "published"), isNull(jobs.deletedAt)))
    .groupBy(sql`coalesce(${categories.name}, 'Uncategorised')`)
    .orderBy(desc(count()))
    .limit(limit + 4);

  return collapseSeries(
    rows.map((row) => ({ key: row.label, label: row.label, value: row.value })),
    limit,
    "Other",
  );
}

/* -------------------------------------------------------------------------- */
/* Needs attention + activity                                                  */
/* -------------------------------------------------------------------------- */

export type AttentionItem = {
  key: string;
  kind: "job" | "report" | "thread";
  title: string;
  meta: string;
  href: string;
  createdAt: Date;
};

export async function getNeedsAttention(limit = 8): Promise<AttentionItem[]> {
  const [heldJobs, openReports, attentionThreads] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        notes: jobs.moderationNotes,
        createdAt: jobs.createdAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "pending_approval"),
          isNotNull(jobs.moderationNotes),
          isNull(jobs.deletedAt),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(4),
    db
      .select({
        id: jobReports.id,
        reason: jobReports.reason,
        title: jobs.title,
        createdAt: jobReports.createdAt,
      })
      .from(jobReports)
      .leftJoin(jobs, eq(jobReports.jobId, jobs.id))
      .where(eq(jobReports.status, "open"))
      .orderBy(desc(jobReports.createdAt))
      .limit(4),
    db
      .select({
        id: inboxThreads.id,
        subject: inboxThreads.subject,
        category: inboxThreads.category,
        createdAt: inboxThreads.updatedAt,
      })
      .from(inboxThreads)
      .where(eq(inboxThreads.needsAttention, true))
      .orderBy(desc(inboxThreads.updatedAt))
      .limit(4),
  ]);

  const items: AttentionItem[] = [
    ...heldJobs.map((job) => ({
      key: `job:${job.id}`,
      kind: "job" as const,
      title: `Held job: ${job.title}`,
      meta: job.notes ? truncate(job.notes, 110) : "Pending review",
      href: "/admin/jobs",
      createdAt: job.createdAt,
    })),
    ...openReports.map((report) => ({
      key: `report:${report.id}`,
      kind: "report" as const,
      title: `Report on ${report.title ?? "a job"}`,
      meta: truncate(report.reason, 110),
      href: "/admin/reports",
      createdAt: report.createdAt,
    })),
    ...attentionThreads.map((thread) => ({
      key: `thread:${thread.id}`,
      kind: "thread" as const,
      title: thread.subject,
      meta: thread.category
        ? `Assistant · ${thread.category}`
        : "Assistant thread needs attention",
      href: `/admin/assistant?thread=${thread.id}`,
      createdAt: thread.createdAt,
    })),
  ];

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items.slice(0, limit);
}

export type ActivityItem = {
  id: number;
  action: string;
  description: string | null;
  actorRole: string | null;
  actorName: string | null;
  createdAt: Date;
};

export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      description: auditLogs.description,
      actorRole: auditLogs.actorRole,
      actorName: users.fullName,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorUserId, users.id))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Assistant status card                                                       */
/* -------------------------------------------------------------------------- */

export type AssistantOverview = {
  accounts: InboxAccountStatus[];
  openThreads: number;
  attentionThreads: number;
  contactedThisWeek: number;
  /** Leads whose outreach was answered (all time - no reply timestamp exists). */
  repliesReceived: number;
  aiEnabled: boolean;
  spendMicros: number;
  capUsd: number;
};

export async function getAssistantOverview(
  now = new Date(),
): Promise<AssistantOverview> {
  const weekStart = startOfIstDay(addIstDays(now, -6));
  const monthStart = startOfIstMonth(now);
  const [
    openRow,
    attentionRow,
    contactedRow,
    repliesRow,
    spendRow,
    settingsRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(inboxThreads)
      .where(eq(inboxThreads.status, "open")),
    db
      .select({ value: count() })
      .from(inboxThreads)
      .where(eq(inboxThreads.needsAttention, true)),
    db
      .select({ value: count() })
      .from(companyLeads)
      .where(
        and(
          isNotNull(companyLeads.lastContactedAt),
          gte(companyLeads.lastContactedAt, weekStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(campaignMessages)
      .where(eq(campaignMessages.status, "replied")),
    db
      .select({
        value: sql<string>`coalesce(sum(${aiUsage.estimatedCostUsdMicros}), 0)::text`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, monthStart)),
    db
      .select()
      .from(assistantSettings)
      .where(eq(assistantSettings.id, 1))
      .limit(1),
  ]);

  const settings = settingsRow[0];
  return {
    accounts: getMailAccountStatuses(),
    openThreads: openRow[0]?.value ?? 0,
    attentionThreads: attentionRow[0]?.value ?? 0,
    contactedThisWeek: contactedRow[0]?.value ?? 0,
    repliesReceived: repliesRow[0]?.value ?? 0,
    aiEnabled: settings?.aiEnabled ?? false,
    spendMicros: Number(spendRow[0]?.value ?? 0),
    capUsd: settings?.monthlySpendCapUsd ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Social posting status card                                                  */
/* -------------------------------------------------------------------------- */

export type SocialOverview = {
  enabled: boolean;
  paused: boolean;
  connections: SocialConnectionStatus[];
  queuedPosts: number;
  failedPosts: number;
  publishedToday: number;
  digestPostedToday: boolean;
  lastError: string | null;
};

export async function getSocialOverview(
  now = new Date(),
): Promise<SocialOverview> {
  const dayStart = startOfIstDay(now);
  const [
    settings,
    queuedRow,
    failedRow,
    publishedRow,
    digestRow,
    failureRow,
  ] = await Promise.all([
    getSocialSettings(),
    db.select({ value: count() }).from(socialPosts).where(eq(socialPosts.status, "queued")),
    db.select({ value: count() }).from(socialPosts).where(eq(socialPosts.status, "failed")),
    db
      .select({ value: count() })
      .from(socialPosts)
      .where(
        and(eq(socialPosts.status, "published"), isNotNull(socialPosts.publishedAt), gte(socialPosts.publishedAt, dayStart)),
      ),
    db
      .select()
      .from(whatsappDigests)
      .where(eq(whatsappDigests.digestDate, istDateKey(now)))
      .limit(1),
    db
      .select({ lastError: socialPosts.lastError })
      .from(socialPosts)
      .where(eq(socialPosts.status, "failed"))
      .orderBy(desc(socialPosts.updatedAt))
      .limit(1),
  ]);

  return {
    enabled: settings.enabled,
    paused: settings.pauseAll,
    connections: getSocialConnectionStatuses(settings),
    queuedPosts: queuedRow[0]?.value ?? 0,
    failedPosts: failedRow[0]?.value ?? 0,
    publishedToday: publishedRow[0]?.value ?? 0,
    digestPostedToday: digestRow.length > 0,
    lastError: failureRow[0]?.lastError ?? null,
  };
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
