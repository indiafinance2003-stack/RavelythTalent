'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { CreditBalance, CreditLedgerEntry, JobPackage, OrderDTO } from '@/lib/portal-client/types';
import { ORDER_STATUS_LABELS, formatDate, formatMoney } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * Job credit packages and the purchase flow.
 *
 * THE BROWSER IS NEVER THE AUTHORITY FOR PAYMENT. Choosing a package creates an
 * order at the price stored on the package row and a matching order at the
 * gateway. The order stays "awaiting payment" until the gateway confirms it
 * through a signed webhook, at which point Ravelyth grants the credits. Nothing
 * on this page can mark an order paid, and the UI says so plainly.
 */
export function PackagesPage(): React.ReactElement {
  const credits = useAsync(
    () =>
      portalGet<{ balance: CreditBalance; packages: JobPackage[]; ledger: CreditLedgerEntry[] }>(
        '/api/portal/employer/credits'
      ),
    []
  );
  const orders = useAsync(() => portalGet<{ items: OrderDTO[] }>('/api/portal/employer/orders'), []);

  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pay, setPay] = useState<{ orderNumber: string; amountMinor: number; providerOrderId: string } | null>(
    null
  );

  const packages = credits.data?.packages ?? [];
  const balance = credits.data?.balance;

  async function buy(pkg: JobPackage): Promise<void> {
    setError(null);
    setMessage(null);

    // The commercial terms must be accepted before an order exists. This is a
    // real precondition, not a decorative checkbox.
    if (!accepted) {
      setError('Please accept the no-refund terms before purchasing.');
      return;
    }

    setBusy(pkg.id);
    try {
      const result = await portalPost<{
        order: { orderNumber: string; amountMinor: number };
        providerOrderId: string;
        providerKeyId: string | null;
      }>('/api/portal/employer/orders', {
        packageId: pkg.id,
        nonRefundableAccepted: true,
      });

      setPay({
        orderNumber: result.order.orderNumber,
        amountMinor: result.order.amountMinor,
        providerOrderId: result.providerOrderId,
      });
      await orders.reload();
      await credits.reload();
    } catch (caught) {
      // A 503 means payments are not configured. Say that, do not fake progress.
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job credits"
        title="Packages and credits"
        description="Each credit lets you submit one job for review. Credits are used when you submit, not when you draft."
        action={
          <Link href="/employer/credits" className="text-sm text-slate-400 hover:text-accent">
            Credit history
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}
      {pay ? (
        <Alert kind="info">
          <p>
            Order <strong>{pay.orderNumber}</strong> was created for {formatMoney(pay.amountMinor)}.
            Complete the payment in the checkout window.
          </p>
          <p className="mt-2 text-xs">
            Gateway reference <code>{pay.providerOrderId}</code>. Credits are granted only when the
            gateway&apos;s signed webhook confirms payment — refreshing this page will not mark it paid.
          </p>
        </Alert>
      ) : null}

      {credits.loading ? <LoadingState label="Loading packages…" /> : null}
      {credits.error ? <ErrorState message={credits.error} onRetry={credits.reload} /> : null}

      {balance ? (
        <Card>
          <CardHeader title="Your balance" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Available</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{balance.available}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{balance.used}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Purchased</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{balance.total}</p>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Available packages" description="Prices are set by Ravelyth and read from the server." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {packages.length === 0 ? (
            <p className="text-sm text-slate-400">No packages are available right now.</p>
          ) : null}
          {packages.map((pkg) => (
            <div key={pkg.id} className="rounded-lg border border-line bg-paper p-5">
              <h3 className="text-base font-semibold text-ink">{pkg.name}</h3>
              <p className="mt-1 text-2xl font-semibold text-accent-soft">
                {formatMoney(pkg.priceMinor, pkg.currency)}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {pkg.credits} job credit{pkg.credits === 1 ? '' : 's'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Valid for {pkg.validityDays} days from purchase.
              </p>
              {pkg.description ? (
                <p className="mt-2 text-sm text-slate-400">{pkg.description}</p>
              ) : null}
              <Button
                onClick={() => buy(pkg)}
                loading={busy === pkg.id}
                className="mt-4 w-full"
              >
                Buy this package
              </Button>
            </div>
          ))}
        </div>

        <div className="border-t border-line p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => {
                setAccepted(event.target.checked);
                setError(null);
              }}
              className="mt-1 h-4 w-4 accent-[#2563eb]"
            />
            <span className="text-sm text-slate-300">
              I understand that job credits are non-refundable once purchased and cannot be
              transferred. Credits are returned only if a job is withdrawn before approval.{' '}
              <Link href="/legal/cancellation" className="text-accent-soft underline">
                Read the cancellation terms
              </Link>
              .
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Your orders" />
        <div className="p-5">
          {orders.loading ? <LoadingState label="Loading orders…" /> : null}
          {orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
          {orders.data && orders.data.items.length === 0 ? (
            <EmptyState title="You have not purchased any credits yet" />
          ) : null}
          {(orders.data?.items ?? []).length > 0 ? (
            <ul className="divide-y divide-line">
              {orders.data!.items.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{order.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatMoney(order.amountMinor, order.currency)} · created{' '}
                      {formatDate(order.createdAt)}
                      {order.paidAt ? ` · paid ${formatDate(order.paidAt)}` : ''}
                    </p>
                  </div>
                  <Badge
                    tone={
                      order.status === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                        : order.status === 'created'
                          ? 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                          : 'bg-slate-800 text-slate-400 ring-slate-700'
                    }
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </div>
  );
}