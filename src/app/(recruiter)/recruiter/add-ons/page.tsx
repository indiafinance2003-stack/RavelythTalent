import type { Metadata } from "next";
import { and, eq, gt } from "drizzle-orm";
import { AddonPurchase } from "@/components/billing/addon-purchase";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { addons } from "@/lib/db/schema";
import { resolveRecruiterCompany, listCompanyJobs } from "@/lib/recruiter/service";
import { razorpayCheckoutConfigured } from "@/lib/billing/razorpay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hiring add-ons" };

export default async function RecruiterAddonsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/add-ons");
  const { company: companyParam } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyParam);
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hiring add-ons" />
        <EmptyState title="Set up your company first" description="Create a company profile before purchasing hiring add-ons." />
      </div>
    );
  }

  const options = await db
    .select({
      id: addons.id,
      name: addons.name,
      description: addons.description,
      type: addons.type,
      pricePaise: addons.pricePaise,
      durationDays: addons.durationDays,
    })
    .from(addons)
    .where(and(eq(addons.isActive, true), gt(addons.pricePaise, 0)))
    .orderBy(addons.sortOrder);
  const jobs = await listCompanyJobs(company.id, { status: "published" });
  const publishedJobs = jobs.map(({ id, title }) => ({ id, title }));

  return (
    <div className="space-y-6">
      <PageHeader title="Hiring add-ons" description={`Optional boosts for ${company.name}.`} />
      {company.status !== "approved" ? (
        <Card>
          <p className="text-sm text-slate-700">Company verification must be approved before purchasing add-ons.</p>
        </Card>
      ) : options.length === 0 ? (
        <EmptyState title="No add-ons available" description="There are no configured add-ons available for purchase right now." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {options.map((addon) => addon.pricePaise !== null ? (
            <AddonPurchase key={addon.id} addon={{ ...addon, pricePaise: addon.pricePaise }} companyId={company.id} jobs={publishedJobs} paymentAvailable={razorpayCheckoutConfigured()} />
          ) : null)}
        </div>
      )}
    </div>
  );
}
