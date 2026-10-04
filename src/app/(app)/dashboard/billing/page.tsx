import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import {
  listInvoices,
  listPayments,
  listSubscriptions,
} from "@/lib/billing/history";
import { BillingHistory } from "@/components/billing/billing-history";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing",
  description: "Your plan, payment history and invoices.",
};

export default async function BillingPage() {
  const user = await requireUser("/dashboard/billing");

  const [subscriptions, payments, invoices] = await Promise.all([
    listSubscriptions(user.id, null),
    listPayments(user.id, null),
    listInvoices(user.id, null),
  ]);

  return (
    <BillingHistory
      subscriptions={subscriptions}
      payments={payments}
      invoices={invoices}
    />
  );
}
