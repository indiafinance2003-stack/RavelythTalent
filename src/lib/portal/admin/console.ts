/**
 * Admin console listings that have no company-scoped equivalent.
 *
 * Applications and payments are visible to an admin because moderation, dispute
 * handling and revenue reporting genuinely need a platform-wide view.
 *
 * That view is READ-ONLY on purpose. An application status belongs to the
 * employer who made the decision, and an order status belongs to the payment
 * provider's signed callback. An admin can read both here but cannot rewrite
 * either, so the console cannot manufacture a hire, or a payment that never
 * happened. Any write path for these goes through the owning party, not here.
 */
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  jobApplications,
  jobs,
  orders,
  payments,
  type OrderRow,
  type PaymentRow,
} from '@/lib/db/portal-schema';

/** One application row, joined with the job it targets. */
export interface AdminApplicationRow {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  candidateId: string;
  status: string;
  coverLetter: string | null;
  employerNotes: string | null;
  appliedAt: string;
  updatedAt: string;
}

/** One order row for the payments console, with its payment attempts. */
export interface AdminPaymentRow {
  order: OrderRow;
  payments: PaymentRow[];
}

/** Paginated application list for the admin console. */
export async function listApplicationsForAdmin(
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<AdminApplicationRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  // The job title and company are joined in rather than fetched per row, so
  // the console stays a single round trip as the table grows. Timestamps are
  // converted to ISO strings because the value crosses the network boundary and
  // `handleApi` serialises with JSON, which would otherwise hand the browser a
  // Date's toJSON() result at an unpredictable precision.
  const rows = await db
    .select({
      id: jobApplications.id,
      jobId: jobApplications.jobId,
      jobTitle: jobs.title,
      companyId: jobs.companyId,
      candidateId: jobApplications.candidateId,
      status: jobApplications.status,
      coverLetter: jobApplications.coverLetter,
      employerNotes: jobApplications.employerNotes,
      appliedAt: jobApplications.appliedAt,
      updatedAt: jobApplications.updatedAt,
    })
    .from(jobApplications)
    .innerJoin(jobs, eq(jobApplications.jobId, jobs.id))
    .where(options.status ? eq(jobApplications.status, options.status) : undefined)
    .orderBy(desc(jobApplications.appliedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row,
    appliedAt: row.appliedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Paginated order list with their payment attempts.
 *
 * A payment row is the provider's own record of an attempt. Showing it lets an
 * admin see WHY an order is unpaid (no attempt, a failed signature, a refund)
 * rather than inferring it from the order status alone.
 */
export async function listPaymentsForAdmin(
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<AdminPaymentRow[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const orderRows = await db
    .select()
    .from(orders)
    .where(options.status ? eq(orders.status, options.status) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  if (orderRows.length === 0) return [];

  const paymentRows = await db
    .select()
    .from(payments)
    .orderBy(desc(payments.createdAt))
    .limit(200);

  return orderRows.map((order) => ({
    order,
    // Filtered against a bounded page that the admin is already authorised to
    // see, so this cannot become a way to page through other companies'
    // payment trails.
    payments: paymentRows.filter((payment) => payment.orderId === order.id),
  }));
}
