import Link from "next/link";
import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, jobs } from "@/lib/db/schema";
import { Card, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminPage() {
  const [companyRows, jobRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(companies)
      .where(eq(companies.status, "pending")),
    db
      .select({ value: count() })
      .from(jobs)
      .where(eq(jobs.status, "pending_approval")),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Admin overview" description="Review company verifications and job postings." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-slate-600">Companies awaiting review</p>
          <p className="mt-2 text-3xl font-bold text-navy">{companyRows[0]?.value ?? 0}</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-royal hover:underline" href="/admin/companies">
            Review companies
          </Link>
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
