import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { addons, invoices, payments, plans, subscriptions, users } from "@/lib/db/schema";
import { formatPaise } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing administration" };

export default async function AdminBillingPage() {
  const [subscriptionRows, paymentRows, invoiceRows] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Read-only view of subscriptions, payments and invoices." />
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
