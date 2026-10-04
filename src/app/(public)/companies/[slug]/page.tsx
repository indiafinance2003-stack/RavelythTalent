import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Alert, Badge, Card } from "@/components/ui/primitives";
import { CompanyReviewForm } from "@/components/companies/company-review-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companies, companyReviews, jobs } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function getCompany(slug: string) {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      about: companies.about,
      industry: companies.industry,
      size: companies.size,
      headquarters: companies.headquarters,
      averageRating: companies.averageRating,
      reviewsCount: companies.reviewsCount,
    })
    .from(companies)
    .where(and(eq(companies.slug, slug), eq(companies.status, "approved"), isNull(companies.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const company = await getCompany(slug);
  return company
    ? { title: company.name, description: company.about || `Explore jobs and reviews for ${company.name}.` }
    : { title: "Company not found" };
}

export default async function CompanyDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [company, user, settings] = await Promise.all([
    getCompany(slug),
    getCurrentUser(),
    getSiteSettings(),
  ]);
  if (!company) notFound();
  const [openJobs, reviews] = await Promise.all([
    db
      .select({
        title: jobs.title,
        slug: jobs.slug,
        city: jobs.city,
        state: jobs.state,
        workMode: jobs.workMode,
        publishedAt: jobs.publishedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.companyId, company.id), eq(jobs.status, "published"), isNull(jobs.deletedAt)))
      .orderBy(desc(jobs.publishedAt))
      .limit(30),
    settings.featureReviews
      ? db
          .select({
            rating: companyReviews.rating,
            title: companyReviews.title,
            pros: companyReviews.pros,
            cons: companyReviews.cons,
            body: companyReviews.body,
            createdAt: companyReviews.createdAt,
          })
          .from(companyReviews)
          .where(and(eq(companyReviews.companyId, company.id), eq(companyReviews.status, "published")))
          .orderBy(desc(companyReviews.createdAt))
          .limit(30)
      : Promise.resolve([]),
  ]);
  const ownReview = user?.role === "job_seeker" && settings.featureReviews
    ? await db
        .select({ status: companyReviews.status })
        .from(companyReviews)
        .where(and(eq(companyReviews.companyId, company.id), eq(companyReviews.userId, user.id)))
        .limit(1)
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <header className="rounded-3xl bg-gradient-to-br from-sky-tint to-mint-tint p-7 sm:p-10">
        {company.industry ? <Badge tone="teal">{company.industry}</Badge> : null}
        <h1 className="mt-3 text-3xl font-extrabold text-navy sm:text-4xl">{company.name}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {[company.headquarters, company.size].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-4 text-sm text-slate-700">
          {company.averageRating && company.reviewsCount > 0
            ? `${company.averageRating} out of 5 · ${company.reviewsCount} published reviews`
            : "No published reviews"}
        </p>
      </header>

      {company.about ? (
        <Card>
          <h2 className="text-xl font-bold text-navy">About {company.name}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{company.about}</p>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-navy">Open positions</h2>
        {openJobs.length ? openJobs.map((job) => (
          <Card key={job.slug}>
            <h3 className="font-bold text-navy">
              <Link className="hover:text-royal" href={`/jobs/${job.slug}`}>{job.title}</Link>
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {[job.city, job.state, job.workMode.replace("_", " "), job.publishedAt?.toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}
            </p>
          </Card>
        )) : <Card><p className="text-sm text-slate-600">There are no published jobs at this time.</p></Card>}
      </section>

      {settings.featureReviews ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-navy">Candidate reviews</h2>
          {reviews.length ? reviews.map((review, index) => (
            <Card key={`${review.createdAt.toISOString()}-${index}`}>
              <p className="text-sm font-bold text-teal-700">{review.rating}/5 · Candidate review</p>
              {review.title ? <h3 className="mt-2 font-bold text-navy">{review.title}</h3> : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{review.body}</p>
              {review.pros || review.cons ? (
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  {review.pros ? <p><strong>Pros:</strong> {review.pros}</p> : null}
                  {review.cons ? <p><strong>Cons:</strong> {review.cons}</p> : null}
                </div>
              ) : null}
              <p className="mt-3 text-xs text-slate-500">{review.createdAt.toLocaleDateString("en-IN")}</p>
            </Card>
          )) : <Card><p className="text-sm text-slate-600">No published reviews yet.</p></Card>}

          {ownReview[0] ? (
            <Alert tone="info">Your review is currently {ownReview[0].status}. You can submit one review per company.</Alert>
          ) : user?.role === "job_seeker" ? (
            <Card>
              <h3 className="mb-4 text-lg font-bold text-navy">Share your experience</h3>
              <CompanyReviewForm companyId={company.id} />
            </Card>
          ) : user ? (
            <Alert tone="info">Company reviews can be submitted by signed-in candidates.</Alert>
          ) : (
            <Alert tone="info">
              <Link className="font-semibold text-royal hover:underline" href={`/login?next=${encodeURIComponent(`/companies/${company.slug}`)}`}>Sign in as a candidate</Link> to submit a review.
            </Alert>
          )}
        </section>
      ) : null}
    </div>
  );
}
