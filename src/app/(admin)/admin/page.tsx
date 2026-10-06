import Link from "next/link";
import type { Metadata } from "next";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, emailOutbox, jobReports, jobs, subscriptions, users } from "@/lib/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";
import { getSiteSettings } from "@/lib/settings";
import { existsSync } from "node:fs";
import path from "node:path";
import { googleConfigured } from "@/lib/auth/google";
import { razorpayLaunchConfigured } from "@/lib/billing/razorpay";
import { smsProviderAvailable } from "@/lib/sms";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminPage() {
  const [companyRows, jobRows, heldJobs, openReports, userRows, approvedCompanies, activeSubscriptions, settings, smtpTest] = await Promise.all([
    db
      .select({ value: count() })
      .from(companies)
      .where(eq(companies.status, "pending")),
    db
      .select({ value: count() })
      .from(jobs)
      .where(eq(jobs.status, "pending_approval")),
    db.select({ value: count() }).from(jobs)
      .where(and(eq(jobs.status, "pending_approval"), isNotNull(jobs.moderationNotes))),
    db.select({ value: count() }).from(jobReports).where(eq(jobReports.status, "open")),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(companies).where(eq(companies.status, "approved")),
    db.select({ value: count() }).from(subscriptions).where(
      and(
        eq(subscriptions.status, "active"),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    ),
    getSiteSettings(),
    db.select({ sentAt: emailOutbox.sentAt })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.templateKey, "admin_test"), eq(emailOutbox.status, "sent")))
      .orderBy(desc(emailOutbox.sentAt))
      .limit(1),
  ]);
  const setupItems = [
    { label: "Logo file", ready: existsSync(path.join(process.cwd(), "public", "logo.svg")) },
    { label: "Legal name", ready: Boolean(settings.legalCompanyName?.trim()) },
    { label: "Business address", ready: Boolean(settings.addressLine1?.trim() && settings.city?.trim() && settings.state?.trim() && settings.postalCode?.trim()) },
    { label: "Support email", ready: Boolean(settings.supportEmail?.trim()) },
    { label: "Phone", ready: Boolean(settings.contactPhone?.trim()) },
    { label: "GSTIN", ready: Boolean(settings.gstin?.trim()) },
    { label: "GST rate", ready: Boolean(settings.updatedByUserId) },
    { label: "Razorpay keys and webhook", ready: razorpayLaunchConfigured() },
    { label: "SMTP delivery test", ready: Boolean(smtpTest[0]?.sentAt) },
    { label: "Google OAuth", ready: googleConfigured() },
    { label: "Real SMS provider", ready: smsProviderAvailable() },
  ];
  const missingSetupItems = setupItems.filter((item) => !item.ready);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" description="Review company verifications and job postings." />
      {missingSetupItems.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50">
          <h2 className="font-bold text-navy">First-run launch checklist</h2>
          <p className="mt-1 text-sm text-slate-700">Complete these settings before opening the portal to customers.</p>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {missingSetupItems.map((item) => (
              <li className="font-medium text-amber-950" key={item.label}>
                Not configured: {item.label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <Link className="font-semibold text-royal hover:underline" href="/admin/settings">Open settings</Link>
            {" · "}
            <Link className="font-semibold text-royal hover:underline" href="/admin/emails">Send an SMTP test</Link>
          </p>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-600">Companies awaiting review</p>
          <p className="mt-2 text-3xl font-bold text-navy">{companyRows[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/companies">
            Review companies
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Registered users</p>
          <p className="mt-2 text-3xl font-bold text-navy">{userRows[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/users">Manage users</Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Approved companies</p>
          <p className="mt-2 text-3xl font-bold text-navy">{approvedCompanies[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/companies">Manage companies</Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Active subscriptions</p>
          <p className="mt-2 text-3xl font-bold text-navy">{activeSubscriptions[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/billing">Billing overview</Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Jobs awaiting moderation</p>
          <p className="mt-2 text-3xl font-bold text-navy">{jobRows[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/jobs">
            Review jobs
          </Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Held jobs</p>
          <p className="mt-2 text-3xl font-bold text-navy">{heldJobs[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/jobs">Review held jobs</Link>
        </Card>
        <Card>
          <p className="text-sm text-slate-600">Open job reports</p>
          <p className="mt-2 text-3xl font-bold text-navy">{openReports[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/reports">Review reports</Link>
        </Card>
      </div>
    </div>
  );
}
