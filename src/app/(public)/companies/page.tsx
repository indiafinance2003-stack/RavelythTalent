import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, isNull } from "drizzle-orm";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verified companies",
  description: "Explore approved companies hiring through Ravelyth Talent.",
};

type SearchParams = Promise<{ q?: string }>;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q } = await searchParams;
  const search = q?.trim().slice(0, 100);
  const rows = await db
    .select({
      name: companies.name,
      slug: companies.slug,
      about: companies.about,
      industry: companies.industry,
      locations: companies.locations,
      averageRating: companies.averageRating,
      reviewsCount: companies.reviewsCount,
    })
    .from(companies)
    .where(and(
      eq(companies.status, "approved"),
      isNull(companies.deletedAt),
      ...(search ? [ilike(companies.name, `%${search.replace(/[%_\\]/g, "\\$&")}%`)] : []),
    ))
    .orderBy(desc(companies.isFeatured), asc(companies.name))
    .limit(60);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <PageHeader title="Companies" description="Find verified employers and explore their open roles." />
      <form action="/companies" className="flex flex-wrap gap-2">
        <input
          aria-label="Search companies"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm"
          defaultValue={search}
          name="q"
          placeholder="Search company names"
        />
        <button className="rounded-xl bg-royal px-5 py-2.5 text-sm font-semibold text-white" type="submit">Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No companies found" description="Try a different company name." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((company) => (
            <Card key={company.slug}>
              <h2 className="text-lg font-bold text-navy">
                <Link className="hover:text-royal" href={`/companies/${company.slug}`}>{company.name}</Link>
              </h2>
              {company.industry ? <p className="mt-1 text-sm font-medium text-teal-700">{company.industry}</p> : null}
              {company.about ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{company.about}</p> : null}
              <p className="mt-4 text-xs text-slate-500">
                {company.averageRating && company.reviewsCount > 0
                  ? `${company.averageRating}/5 · ${company.reviewsCount} reviews`
                  : "No reviews yet"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
