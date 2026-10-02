import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  reports,
  type ReportRow,
  type ReportStatus,
  type ReportTargetType,
} from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { recordPortalAudit } from '@/lib/portal/audit';
import { cleanText } from '@/lib/portal/candidates/profile';

/**
 * Reports and complaints (see §20).
 *
 * Any authenticated user may report a job, company, employer or candidate. A
 * reporter is stored so a user can see the outcome of their own report, and an
 * admin resolves it with notes and a resolution, both of which are audited.
 */

const REPORT_REASONS = [
  'inappropriate_content',
  'misleading_or_scam',
  'discriminatory',
  'spam_or_duplicate',
  'copyright_or_trademark',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface CreateReportInput {
  reporterUserId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string | null;
}

/** Files a report against a job, company, employer or candidate. */
export async function createReport(input: CreateReportInput): Promise<ReportRow> {
  const { db } = dbFromRequest();

  if (!['job', 'company', 'employer', 'candidate'].includes(input.targetType)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported report target type.');
  }
  if (!REPORT_REASONS.includes(input.reason)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unsupported report reason.');
  }
  const targetId = cleanText(input.targetId, 64);
  if (!targetId) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'A report target is required.');
  }

  const [row] = await db
    .insert(reports)
    .values({
      reporterUserId: input.reporterUserId,
      targetType: input.targetType,
      targetId,
      reason: input.reason,
      description: cleanText(input.description, 2000),
      status: 'open',
    })
    .returning();

  return row;
}

/** Reports filed by one user, so they can track their own reports. */
export async function listReportsByReporter(reporterUserId: string): Promise<ReportRow[]> {
  const { db } = dbFromRequest();
  return db
    .select()
    .from(reports)
    .where(eq(reports.reporterUserId, reporterUserId))
    .orderBy(desc(reports.createdAt))
    .limit(100);
}

/** Reports for the admin moderation queue. */
export async function listReportsForAdmin(
  options: { status?: ReportStatus; limit?: number; offset?: number } = {}
): Promise<ReportRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);

  return db
    .select()
    .from(reports)
    .where(options.status ? eq(reports.status, options.status) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(limit)
    .offset(Math.max(options.offset ?? 0, 0));
}

/** Admin resolution. Always audited with the outcome. */
export async function resolveReport(input: {
  reportId: string;
  status: Extract<ReportStatus, 'resolved' | 'dismissed' | 'reviewing'>;
  adminUserId: string;
  resolution?: string | null;
  adminNotes?: string | null;
}): Promise<ReportRow> {
  const { db } = dbFromRequest();
  const now = new Date();

  const [row] = await db
    .update(reports)
    .set({
      status: input.status,
      resolution: cleanText(input.resolution, 2000),
      adminNotes: cleanText(input.adminNotes, 2000),
      resolvedByUserId: ['resolved', 'dismissed'].includes(input.status) ? input.adminUserId : null,
      resolvedAt: ['resolved', 'dismissed'].includes(input.status) ? now : null,
      updatedAt: now,
    })
    .where(eq(reports.id, input.reportId))
    .returning();

  if (!row) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'The requested report was not found.', 404);
  }

  await recordPortalAudit({
    action: input.status === 'dismissed' ? 'report_dismissed' : 'report_resolved',
    actorUserId: input.adminUserId,
    description: `Report marked ${input.status}`,
    metadata: { reportId: input.reportId, targetType: row.targetType, targetId: row.targetId },
  });

  return row;
}
