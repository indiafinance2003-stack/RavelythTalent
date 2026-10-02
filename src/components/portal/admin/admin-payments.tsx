'use client';

import { useState } from 'react';
import { portalGet } from '@/lib/portal-client/client';
import { formatDateTime, formatMoney, ORDER_STATUS_LABELS, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminPaymentRow } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  inputClass,
  labelClass,
} from '@/components/portal/ui';
import { PageNav } from '@/components/portal/admin/pager';

/** A payment row's status, coloured by whether money actually moved. */
function paymentTone(status: string): string {
  if (status === 'captured' || status === 'paid') {
    return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40';
  }
  if (status === 'failed' || status === 'refunded') {
    return 'bg-red-500/10 text-red-300 ring-red-500/40';
  }
  return 'bg-slate-800 text-slate-300 ring-slate-600';
}

/**
 * The orders and payments console.
 *
 * READ-ONLY, and this is the most important constraint on the screen. An order
 * only becomes `paid` when the provider's signature verifies server-side, and
 * there is deliberately no admin route that can mark one paid. If an
 * administrator could flip that flag, the revenue figures elsewhere in this
 * console would be editable by anyone with a staff login, and a mistaken
 * "fix" would grant job credits that were never paid for.
 *
 * Corrections have to go through the gateway, whose webhook then writes the
 * truthful result. The attempt history is shown so an admin can see exactly what
 * the provider recorded, including a failed attempt and its reason.
 */
export function AdminPayments(): React.ReactElement {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);

  const payments = useAsync(
    () =>
      portalGet<{ items: AdminPaymentRow[] }>(
        `/api/portal/admin/payments?limit=25&offset=${offset}${status ? `&status=${status}` : ''}`
      ),
    [status, offset]
  );

  const items = payments.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Orders and payments"
        description="Read-only. An order is marked paid only by a verified provider callback, never by an administrator."
      />

      <Alert kind="info">
        There is deliberately no way to mark an order paid from this console. If a payment looks wrong,
        check the attempt history below first, then resolve it with the payment provider — their signed
        webhook updates the order with the real outcome.
      </Alert>

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <label className={labelClass} htmlFor="ap-status">
              Order status
            </label>
            <select
              id="ap-status"
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All orders</option>
              <option value="created">Awaiting payment</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} on this page</p>
        </div>
      </Card>

      {payments.loading ? <LoadingState label="Loading orders…" /> : null}
      {payments.error ? <ErrorState message={payments.error} onRetry={payments.reload} /> : null}

      {items.length === 0 && !payments.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState title="No orders match this filter" />
          </div>
        </Card>
      ) : null}

      {items.map(({ order, payments: attempts }) => (
        <Card key={order.id}>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{order.orderNumber}</h3>
                <p className="text-xs text-slate-500">
                  {order.orderType === 'premium' ? 'Candidate premium' : 'Job credits'} · company{' '}
                  {order.companyId}
                </p>
                <p className="text-xs text-slate-600">Created {formatDateTime(order.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-lg font-semibold text-ink">
                  {formatMoney(order.amountMinor, order.currency)}
                </p>
                <Badge
                  tone={
                    order.status === 'paid'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-300 ring-slate-600'
                  }
                >
                  {ORDER_STATUS_LABELS[order.status] ?? titleCase(order.status)}
                </Badge>
              </div>
            </div>

            {order.paidAt ? (
              <p className="text-xs text-emerald-400">Paid {formatDateTime(order.paidAt)}</p>
            ) : null}
            {!order.nonRefundableAccepted ? (
              <p className="text-xs text-amber-400">
                The non-refundable terms were not recorded as accepted for this order.
              </p>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Payment attempts
              </p>
              {attempts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No payment was ever attempted against this order, which is why it is unpaid.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {attempts.map((attempt) => (
                    <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">
                          {attempt.provider ?? 'unknown provider'}
                          {attempt.method ? ` · ${attempt.method}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(attempt.createdAt)}
                          {attempt.providerPaymentId ? ` · ${attempt.providerPaymentId}` : ''}
                        </p>
                        {attempt.failureReason ? (
                          <p className="text-xs text-red-300">Failed: {attempt.failureReason}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-300">
                          {formatMoney(attempt.amountMinor, attempt.currency)}
                        </span>
                        <Badge tone={paymentTone(attempt.status)}>{titleCase(attempt.status)}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ))}

      <PageNav offset={offset} hasNext={items.length === 25} onChange={setOffset} />
    </div>
  );
}

