'use client';

import { useState } from 'react';
import { portalDownload, portalGet } from '@/lib/portal-client/client';
import { useAsync } from '@/lib/portal-client/use-async';
import type { PortalInvoiceDTO } from '@/lib/portal-client/types';
import { formatDate, formatMoney } from '@/lib/portal-client/format';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The company's billing documents.
 *
 * Every figure shown here is the snapshot recorded at issue time: the subtotal,
 * the tax line and the total all come from the stored invoice, so re-pricing a
 * plan later cannot retroactively change what a customer was told they owed.
 *
 * There is deliberately no "reissue" or "mark paid" control here. An invoice
 * exists because money was actually settled, and nothing on this page can create
 * one or change one.
 */
export function InvoicesPage(): React.ReactElement {
  const invoices = useAsync(
    () => portalGet<{ items: PortalInvoiceDTO[] }>('/api/portal/employer/invoices'),
    []
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = invoices.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Your invoices"
        description="A tax invoice is issued for every completed purchase, from the amount your payment provider actually settled."
      />

      {invoices.loading ? <LoadingState label="Loading your invoices…" /> : null}
      {invoices.error ? <ErrorState message={invoices.error} onRetry={invoices.reload} /> : null}

      {!invoices.loading && !invoices.error && items.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="An invoice appears here once a plan or credit purchase has been paid for."
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader
            title={`${items.length} invoice${items.length === 1 ? '' : 's'}`}
            description="Newest first."
          />
          <ul className="divide-y divide-line">
            {items.map((invoice) => (
              <li key={invoice.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{invoice.invoiceNumber}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{invoice.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Issued {formatDate(invoice.issuedAt)}
                      {invoice.paidAt ? ` · paid ${formatDate(invoice.paidAt)}` : ''}
                      {invoice.periodStart && invoice.periodEnd
                        ? ` · covers ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-ink">
                      {formatMoney(invoice.totalMinor, invoice.currency)}
                    </span>
                    <Badge
                      tone={
                        invoice.status === 'paid'
                          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                          : invoice.status === 'void'
                            ? 'bg-slate-800 text-slate-400 ring-slate-700'
                            : 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
                <InvoiceBreakdown
                  invoice={invoice}
                  open={expanded === invoice.id}
                  onToggle={() => setExpanded(expanded === invoice.id ? null : invoice.id)}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
/** The itemised breakdown, hidden until asked for. */
function InvoiceBreakdown({
  invoice,
  open,
  onToggle,
}: {
  invoice: PortalInvoiceDTO;
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => portalDownload(`/api/portal/employer/invoices/${invoice.id}/pdf`, `${invoice.invoiceNumber}.pdf`)}
          className="text-xs text-accent-soft hover:text-accent"
        >
          Download PDF
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-xs text-accent-soft hover:text-accent"
        >
          {open ? 'Hide breakdown' : 'Show breakdown'}
        </button>
      </div>
      {open ? (
        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-slate-400">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatMoney(invoice.subtotalMinor, invoice.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax{invoice.taxRateBasisPoints ? ` @ ${(invoice.taxRateBasisPoints / 100).toFixed(2)}%` : ''}</dt>
            <dd>{formatMoney(invoice.taxMinor, invoice.currency)}</dd>
          </div>
          <div className="flex justify-between font-medium text-slate-200">
            <dt>Total paid</dt>
            <dd>{formatMoney(invoice.totalMinor, invoice.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Billed to</dt>
            <dd className="text-right">{invoice.customerName}</dd>
          </div>
          {invoice.customerGstin ? (
            <div className="flex justify-between">
              <dt>GSTIN</dt>
              <dd>{invoice.customerGstin}</dd>
            </div>
          ) : null}
          {invoice.paymentReference ? (
            <div className="flex justify-between">
              <dt>Payment reference</dt>
              <dd className="truncate">{invoice.paymentReference}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}