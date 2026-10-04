import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { requireCompanyContext } from '@/lib/portal/auth-context';
import {
  getCompanyPlanOverview,
  listSubscriptionEvents,
  getSubscriptionRow,
  recordSubscriptionEventWith,
} from '@/lib/portal/recruiter-plans/service';
import { dbFromRequest } from '@/lib/db/request';
import { recruiterSubscriptions } from '@/lib/db/portal-schema';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

/**
 * GET  /api/portal/employer/subscription - plan, usage and lifecycle history
 * PATCH /api/portal/employer/subscription - cancel / resume at period end
 *
 * Everything reported here is computed server-side by the same code that
 * ENFORCES posting limits, so the dashboard can never show a number the
 * enforcement layer disagrees with.
 */

const cancelSchema = z
  .object({
    action: z.enum(['cancel_at_period_end', 'resume']),
  })
  .strict();

export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company } = await requireCompanyContext();
    const overview = await getCompanyPlanOverview(company.id);
    const events = overview.subscription
      ? await listSubscriptionEvents(overview.subscription.id, 25)
      : [];
    return { ...overview, events };
  });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const { company, user } = await requireCompanyContext();
    const body = await readJsonBody(req);
    const input = cancelSchema.parse(body);

    const { db } = dbFromRequest();
    const row = await getSubscriptionRow(company.id, db);
    if (!row || (row.status !== 'active' && row.status !== 'expiring')) {
      throw new AppError(
        AppErrorCode.NOT_FOUND,
        'There is no active subscription to change.',
        404
      );
    }

    const now = new Date();
    const cancel = input.action === 'cancel_at_period_end';
    const [updated] = await db
      .update(recruiterSubscriptions)
      .set({
        cancelAtPeriodEnd: cancel,
        cancelledAt: cancel ? (row.cancelledAt ?? now) : null,
        updatedAt: now,
      })
      .where(eq(recruiterSubscriptions.id, row.id))
      .returning();
    if (!updated) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Subscription not found.', 404);
    }

    // History first-class: cancel/resume is a decision someone must be able to
    // reconstruct later, not just a boolean that flipped.
    await recordSubscriptionEventWith(db, {
      subscriptionId: row.id,
      eventType: cancel ? 'cancelled' : 'resumed',
      toPlanId: row.planId,
      billingPeriod: row.billingPeriod,
      notes: cancel
        ? 'Cancel requested; access continues to the end of the paid period.'
        : 'Cancellation withdrawn; the subscription will renew as normal.',
      actorUserId: user.id,
    });

    const overview = await getCompanyPlanOverview(company.id);
    return overview;
  });
}