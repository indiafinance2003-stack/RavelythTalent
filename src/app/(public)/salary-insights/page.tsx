import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { listSalaryInsights, SALARY_INSIGHT_MIN_SAMPLE } from "@/lib/jobs/salary-insights";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Salary insights",
  description: "Explore aggregated salary ranges from published Ravelyth Talent jobs.",
};

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default async function SalaryInsightsPage() {
  const settings = await getSiteSettings();
  if (!settings.featureSalaryInsights) notFound();
  const rows = await listSalaryInsights();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader
        title="Salary insights"
        description={`Annualized ranges from published job postings. Groups with fewer than ${SALARY_INSIGHT_MIN_SAMPLE} disclosed salaries are not shown.`}
      />
      <p className="text-sm text-slate-600">
        These figures are aggregated listing ranges, not guarantees or individual compensation recommendations.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="Not enough disclosed salary data"
          description={`Insights appear after at least ${SALARY_INSIGHT_MIN_SAMPLE} comparable published salary ranges are available for a role and location.`}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((row) => (
            <Card key={`${row.title}-${row.category}-${row.location}`}>
              <h2 className="text-lg font-bold text-navy">{row.title}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {[row.category, row.location].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-4 text-xl font-bold text-royal">
                {rupees(row.annualMinPaise)} – {rupees(row.annualMaxPaise)} / year
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Based on {row.sampleSize} published postings · Annualized from listed pay periods
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
