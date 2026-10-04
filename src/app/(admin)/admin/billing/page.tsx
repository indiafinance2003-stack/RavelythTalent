import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { addons, companies, invoices, payments, plans, subscriptions, users } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils";
import { grantOfflineSubscriptionAction } from "@/lib/admin/offline-subscription-action";

export const metadata: Metadata = { title: "Billing administration" };

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ activated?: string }>;
}) {
  const { activated } = await searchParams;
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
    db.select({ id: plans.id, name: plans.name, audience: plans.audience })
      .from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.name)),
    db.select({ id: users.id, name: users.fullName, email: users.email })
      .from(users).where(eq(users.role, "job_seeker")).orderBy(asc(users.fullName)).limit(500),
    db.select({ id: companies.id, name: companies.name })
      .from(companies).orderBy(asc(companies.name)).limit(500),
  ]);

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
        <form action={grantOfflineSubscriptionAction} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-navy">
            Candidate or company
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="target" required>
              <option value="">Select an account</option>
              <optgroup label="Candidates">
                {candidates.map((candidate) => <option key={candidate.id} value={`candidate:${candidate.id}`}>{candidate.name} · {candidate.email}</option>)}
              </optgroup>
              <optgroup label="Companies">
                {companyOptions.map((company) => <option key={company.id} value={`company:${company.id}`}>{company.name}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="text-sm font-medium text-navy">
            Plan
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="planId" required>
              <option value="">Select a plan</option>
              {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.audience}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-navy">
            Billing period
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="billingPeriod" required>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label className="text-sm font-medium text-navy">
            Start date
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="startDate" required type="date" />
          </label>
          <label className="text-sm font-medium text-navy">
            Action
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="mode" required>
              <option value="grant">Grant / replace</option>
              <option value="extend">Extend the current plan</option>
            </select>
          </label>
          <label className="text-sm font-medium text-navy">
            Offline payment reference (optional)
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={200} name="paymentReference" />
          </label>
          <label className="text-sm font-medium text-navy md:col-span-2">
            Admin notes (optional)
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={2000} name="notes" rows={3} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-navy">
            <input name="generateInvoice" type="checkbox" />
            Generate and email an invoice
          </label>
          <div className="md:col-span-2">
            <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">Activate subscription</button>
          </div>
        </form>
      </Card>
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-navy">Subscriptions</h2>
        {subscriptionRows.map((row) => (
          <Card className="flex flex-wrap justify-between gap-3" key={row.id}>
            <div>
              <p className="font-semibold text-navy">{row.planName} · {row.userName}</p>
              <p className="text-sm text-slate-600">{row.userEmail} · {row.billingPeriod} · until {row.periodEnd.toLocaleDateString("en-IN")}</p>
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
              <p className="text-sm text-slate-600">{row.userEmail} · {row.createdAt.toLocaleString("en-IN")}</p>
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
              <p className="text-sm text-slate-600">{row.customerEmail} · {row.issuedAt.toLocaleDateString("en-IN")}</p>
              <p className="mt-1 text-xs text-slate-500">Owner: {row.userId}{row.companyId ? ` · Company: ${row.companyId}` : ""}</p>
            </div>
            <p className="text-sm font-semibold text-navy">{row.status} · {formatPaise(row.totalPaise)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
