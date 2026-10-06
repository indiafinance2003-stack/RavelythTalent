import Link from "next/link";
import { Download, ReceiptText } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatIndianDateTime, formatPaise } from "@/lib/utils";
import type {
  InvoiceRow,
  PaymentRow,
  SubscriptionRow,
} from "@/lib/billing/history";

/**
 * Read-only billing history (server component): current plan, payment attempts
 * and downloadable invoices. Reused by the candidate and recruiter areas.
 */

const SUBSCRIPTION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  pending: "warning",
  past_due: "danger",
  expired: "neutral",
  cancelled: "neutral",
};

const PAYMENT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  captured: "success",
  authorized: "warning",
  created: "neutral",
  failed: "danger",
  refunded: "neutral",
  partial_refunded: "neutral",
};

export function BillingHistory({
  subscriptions,
  payments,
  invoices,
  upgradeHref = "/pricing",
}: {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  invoices: InvoiceRow[];
  upgradeHref?: string;
}) {
  const current = subscriptions.find((s) => s.status === "active") ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Your plan, payment history and downloadable invoices."
        action={
          <Link
            href={upgradeHref}
            className="inline-flex rounded-xl bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-royal-600"
          >
            Change plan
          </Link>
        }
      />

      <Card>
        <h2 className="text-sm font-bold text-navy">Current plan</h2>
        {current ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xl font-extrabold text-navy">{current.planName}</p>
              <p className="text-sm text-slate-600">
                {formatPaise(current.amountPaise)} per{" "}
                {current.billingPeriod === "yearly" ? "year" : "month"}
              </p>
            </div>
            <Badge tone={SUBSCRIPTION_TONE[current.status] ?? "neutral"}>
              {current.status}
            </Badge>
            <p className="text-sm text-slate-600">
              {current.cancelledAt
                ? `Ended ${formatIndianDateTime(current.cancelledAt)}`
                : `Renews on ${formatIndianDateTime(current.currentPeriodEnd)}`}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            You are on the free plan. Head to{" "}
            <Link href={upgradeHref} className="font-semibold text-royal hover:underline">
              pricing
            </Link>{" "}
            to upgrade.
          </p>
        )}
      </Card>

      <section aria-labelledby="invoices-heading">
        <h2 id="invoices-heading" className="text-base font-bold text-navy">
          Invoices
        </h2>
        {invoices.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<ReceiptText className="h-8 w-8" aria-hidden="true" />}
              title="No invoices yet"
              description="A tax invoice is generated for every successful payment."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="surface flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-mono text-sm font-bold text-navy">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-sm text-slate-600">
                    {invoice.planName} · {formatIndianDateTime(invoice.issuedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-navy">
                    {formatPaise(invoice.totalPaise)}
                  </span>
                  <Badge
                    tone={invoice.status === "paid" ? "success" : "warning"}
                  >
                    {invoice.status}
                  </Badge>
                  {invoice.hasPdf ? (
                    <a
                      href={`/api/files/invoices/${invoice.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      PDF
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-base font-bold text-navy">
          Payments
        </h2>
        {payments.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No payments yet"
              description="Payment attempts will show up here, successful or not."
            />
          </div>
        ) : (
          <div className="surface mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-slate-600">
                      {formatIndianDateTime(payment.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {payment.orderId}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {payment.method ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-navy">
                      {formatPaise(payment.amountPaise)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={PAYMENT_TONE[payment.status] ?? "neutral"}>
                        {payment.status}
                      </Badge>
                      {payment.failureReason ? (
                        <p className="mt-1 max-w-[220px] text-xs text-red-600">
                          {payment.failureReason}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
