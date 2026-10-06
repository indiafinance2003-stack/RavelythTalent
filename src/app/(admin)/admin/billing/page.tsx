import type { Metadata } from "next";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { addons, companies, invoices, payments, plans, subscriptions, users } from "@/lib/db/schema";
import { formatIndianDateTime, formatPaise } from "@/lib/utils";
import { SubscriptionActivationForm } from "@/components/admin/subscription-activation-form";

export const metadata: Metadata = { title: "Billing administration" };

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string; ownerType?: string; ownerQuery?: string }>;
}) {
  const params = await searchParams;
  const { activated } = params;
  const ownerType = params.ownerType === "candidate" || params.ownerType === "company"
    ? params.ownerType
    : null;
  const ownerQuery = params.ownerQuery?.trim().slice(0, 100) ?? "";
  const pattern = `%${ownerQuery.replace(/[%_]/g, "\\$&")}%`;
  const [subscriptionRows, paymentRows, invoiceRows, availablePlans, candidates, companyOptions] = await Promise.all([
    db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      amountPaise: subscriptions.amountPaise,
      billingPeriod: subscriptions.billingPeriod,
      periodEnd: subscriptions.currentPeriodEnd,
      userName: users.fullName,
      userEmail: users.email,
      planName: plans.name,
    })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(100),
    db.select({
      id: payments.id,
      purpose: payments.purpose,
      status: payments.status,
      amountPaise: payments.amountPaise,
      orderId: payments.orderId,
      paymentId: payments.paymentId,
      createdAt: payments.createdAt,
      userName: users.fullName,
      userEmail: users.email,
      planName: plans.name,
      addonName: addons.name,
    })
      .from(payments)
      .innerJoin(users, eq(users.id, payments.userId))
      .leftJoin(plans, eq(plans.id, payments.planId))
      .leftJoin(addons, eq(addons.id, payments.addonId))
      .orderBy(desc(payments.createdAt))
      .limit(100),
    db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      customerName: invoices.customerName,
      customerEmail: invoices.customerEmail,
      totalPaise: invoices.totalPaise,
      status: invoices.status,
      issuedAt: invoices.issuedAt,
      userId: invoices.userId,
      companyId: invoices.companyId,
    }).from(invoices).orderBy(desc(invoices.issuedAt)).limit(100),
    db.select({
      id: plans.id,
      name: plans.name,
      audience: plans.audience,
      priceMonthlyPaise: plans.priceMonthlyPaise,
      priceYearlyPaise: plans.priceYearlyPaise,
    })
      .from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.name)),
    ownerType === "candidate" && ownerQuery
      ? db.select({ id: users.id, name: users.fullName, email: users.email })
          .from(users)
          .where(and(
            eq(users.role, "job_seeker"),
            isNull(users.deletedAt),
            or(ilike(users.email, pattern), ilike(users.fullName, pattern)),
          ))
          .orderBy(asc(users.fullName))
          .limit(30)
      : Promise.resolve([]),
    ownerType === "company" && ownerQuery
      ? db.select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(and(isNull(companies.deletedAt), ilike(companies.name, pattern)))
          .orderBy(asc(companies.name))
          .limit(30)
      : Promise.resolve([]),
  ]);
  const targets = ownerType === "candidate"
    ? candidates
    : ownerType === "company"
      ? companyOptions
      : [];
  const matchingPlans = availablePlans.filter((plan) =>
    plan.audience === (ownerType === "company" ? "employer" : "candidate") &&
    (plan.priceMonthlyPaise > 0 || plan.priceYearlyPaise > 0),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Manage subscriptions, payments and invoices." />
      {activated === "1" ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950" role="status">
          Subscription activation was recorded and the activation email was queued.
        </div>
      ) : null}
      <Card>
        <h2 className="text-lg font-bold text-navy">Grant or extend a subscription</h2>
        <p className="mt-1 text-sm text-slate-600">Offline bank-transfer or UPI activations are recorded as offline payments and audited. An extension starts after the current period when possible.</p>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-medium text-navy">
            Owner type
            <select className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2" defaultValue={ownerType ?? "candidate"} name="ownerType">
              <option value="candidate">Candidate</option>
              <option value="company">Company</option>
            </select>
          </label>
          <label className="min-w-64 flex-1 text-sm font-medium text-navy">
            Search by candidate name/email or company name
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={ownerQuery} maxLength={100} name="ownerQuery" required />
          </label>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-navy hover:border-royal" type="submit">
            Search owners
          </button>
        </form>
        {ownerType && ownerQuery ? targets.length ? (
          <SubscriptionActivationForm ownerType={ownerType} plans={matchingPlans} targets={targets} />
        ) : (
          <p className="mt-4 text-sm text-slate-600">No matching {ownerType === "company" ? "companies" : "candidates"} found.</p>
        ) : null}
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Subscriptions</h2>
        {subscriptionRows.map((row) => (
          <Card className="flex flex-wrap justify-between gap-3" key={row.id}>
            <div>
              <p className="font-semibold text-navy">{row.planName} · {row.userName}</p>
              <p className="text-sm text-slate-600">{row.userEmail} · {row.billingPeriod} · until {formatIndianDateTime(row.periodEnd)}</p>
            </div>
            <p className="text-sm font-semibold text-navy">{row.status} · {formatPaise(row.amountPaise)}</p>
          </Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Payments</h2>
        {paymentRows.map((row) => (
          <Card className="flex flex-wrap justify-between gap-3" key={row.id}>
            <div>
              <p className="font-semibold text-navy">{row.planName ?? row.addonName ?? row.purpose} · {row.userName}</p>
              <p className="text-sm text-slate-600">{row.userEmail} · {formatIndianDateTime(row.createdAt)}</p>
              <p className="mt-1 break-all text-xs text-slate-500">Order: {row.orderId}{row.paymentId ? ` · Payment: ${row.paymentId}` : ""}</p>
            </div>
            <p className="text-sm font-semibold text-navy">{row.status} · {formatPaise(row.amountPaise)}</p>
          </Card>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Invoices</h2>
        {invoiceRows.map((row) => (
          <Card className="flex flex-wrap justify-between gap-3" key={row.id}>
            <div>
              <p className="font-semibold text-navy">{row.invoiceNumber} · {row.customerName}</p>
              <p className="text-sm text-slate-600">{row.customerEmail} · {formatIndianDateTime(row.issuedAt)}</p>
              <p className="mt-1 text-xs text-slate-500">Owner: {row.userId}{row.companyId ? ` · Company: ${row.companyId}` : ""}</p>
            </div>
            <p className="text-sm font-semibold text-navy">{row.status} · {formatPaise(row.totalPaise)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
