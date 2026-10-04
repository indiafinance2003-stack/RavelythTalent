import Link from "next/link";
import type { Metadata } from "next";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs, subscriptions, users } from "@/lib/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminPage() {
  const [companyRows, jobRows, userRows, approvedCompanies, activeSubscriptions] = await Promise.all([
    db
      .select({ value: count() })
      .from(companies)
      .where(eq(companies.status, "pending")),
    db
      .select({ value: count() })
      .from(jobs)
      .where(eq(jobs.status, "pending_approval")),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(companies).where(eq(companies.status, "approved")),
    db.select({ value: count() }).from(subscriptions).where(
      and(
        eq(subscriptions.status, "active"),
        sql`${subscriptions.currentPeriodEnd} > now()`,
      ),
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" description="Review company verifications and job postings." />
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
      </div>
    </div>
  );
}
