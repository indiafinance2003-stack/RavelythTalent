import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current-user";
import { listUserCompanies } from "@/lib/entitlements";
import {
  listInvoices,
  listPayments,
  listSubscriptions,
} from "@/lib/billing/history";
import { BillingHistory } from "@/components/billing/billing-history";
import { Alert, EmptyState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing",
  description: "Company plan, payment history and invoices.",
};

/**
 * Employer billing history for one company (`?company=<id>`, defaults to the
 * first company the user belongs to). The recruiter area layout lands in
 * Phase 5; this route guards itself with `requireUser` in the meantime.
 */
export default async function RecruiterBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/billing");
  const { company: companyIdParam } = await searchParams;

  const companies = await listUserCompanies(user.id);
  if (companies.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <EmptyState
          title="No company yet"
          description="Create your company profile to subscribe to an employer plan."
          action={
            <Link
              href="/recruiter/company"
              className="inline-flex rounded-xl bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-royal-600"
            >
              Set up company
            </Link>
          }
        />
      </div>
    );
  }

  const company = companies.find((c) => c.id === companyIdParam) ?? companies[0]!;

  const [subscriptions, payments, invoices] = await Promise.all([
    listSubscriptions(user.id, company.id),
    listPayments(user.id, company.id),
    listInvoices(user.id, company.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      {companies.length > 1 ? (
        <Alert tone="info" title="Viewing one company">
          Showing billing for{" "}
          <span className="font-semibold">{company.name}</span>. Other companies:{" "}
          {companies
            .filter((c) => c.id !== company.id)
            .map((c) => (
              <Link
                key={c.id}
                href={`/recruiter/billing?company=${c.id}`}
                className="mx-1 font-semibold text-royal hover:underline"
              >
                {c.name}
              </Link>
            ))}
          .
        </Alert>
      ) : null}

      <BillingHistory
        subscriptions={subscriptions}
        payments={payments}
        invoices={invoices}
      />
    </div>
  );
}
