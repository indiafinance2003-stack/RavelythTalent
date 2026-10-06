import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  Briefcase,
  Building2,
  CalendarClock,
  GraduationCap,
  MapPin,
  Users,
} from "lucide-react";
import { db } from "@/lib/db";
import { applications, resumes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getJobSkillNames,
  getPublishedJobBySlug,
  searchJobs,
} from "@/lib/jobs/queries";
import { isJobSaved } from "@/lib/applications/service";
import { buildJobPostingJsonLd } from "@/lib/seo/job-posting";
import { appUrl } from "@/lib/email/urls";
import {
  JOB_TYPE_LABEL,
  WORK_MODE_LABEL,
  formatDate,
  formatExperience,
  formatSalaryRange,
  labelFor,
} from "@/lib/utils";
import { ApplyPanel } from "@/components/jobs/apply-panel";
import { ReportJobButton } from "@/components/jobs/report-job-button";
import { JobCardView } from "@/components/jobs/job-card";
import {
  Badge,
  Card,
  DecorCircles,
} from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedJobBySlug(slug);
  if (!found) {
    return { title: "Job not found", robots: { index: false, follow: false } };
  }

  const location = [found.job.city, found.job.state].filter(Boolean).join(", ");
  const title = `${found.job.title} at ${found.companyName}`;
  const description = [
    location || "India",
    labelFor(WORK_MODE_LABEL, found.job.workMode),
    labelFor(JOB_TYPE_LABEL, found.job.jobType),
    "Apply online on Ravelyth Talent.",
  ].join(" - ");

  return {
    title,
    description,
    alternates: { canonical: `/jobs/${slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/jobs/${slug}`,
      siteName: "Ravelyth Talent",
    },
  };
}
export default async function JobDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const found = await getPublishedJobBySlug(slug);
  if (!found) notFound();

  const { job, companyName, companySlug, companyStatus } = found;
  const user = await getCurrentUser();

  const [skills, related, appliedRows, resumeRows] = await Promise.all([
    getJobSkillNames(job.id),
    searchJobs({ category: found.categorySlug ?? undefined, pageSize: 4 }),
    user
      ? db
          .select({ id: applications.id })
          .from(applications)
          .where(
            and(
              eq(applications.jobId, job.id),
              eq(applications.candidateUserId, user.id),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    user
      ? db
          .select({
            id: resumes.id,
            label: resumes.label,
            originalName: resumes.originalName,
          })
          .from(resumes)
          .where(and(eq(resumes.userId, user.id), isNull(resumes.deletedAt)))
          .orderBy(desc(resumes.isDefault), desc(resumes.createdAt))
          .limit(10)
      : Promise.resolve([]),
  ]);

  const alreadyApplied = Boolean(appliedRows.at(0));
  const saved = user ? await isJobSaved(user.id, job.id) : false;
  const resumeOptions = resumeRows.map((r) => ({
    id: r.id,
    label: r.label ?? r.originalName,
  }));
  const relatedJobs = related.rows.filter((r) => r.id !== job.id).slice(0, 3);
  const location = [job.city, job.state].filter(Boolean).join(", ");

  const jsonLd = buildJobPostingJsonLd({
    job: { ...job, categoryName: found.categoryName },
    companyName,
    companySlug,
    appUrl: appUrl(),
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <div className="relative">
        <DecorCircles />

        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
            <Link href="/jobs" className="hover:text-royal">
              Jobs
            </Link>
            {found.categoryName ? (
              <>
                <span className="mx-2">/</span>
                <Link
                  href={`/jobs?category=${found.categorySlug}`}
                  className="hover:text-royal"
                >
                  {found.categoryName}
                </Link>
              </>
            ) : null}
          </nav>
<div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
            <article>
              <header className="surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-2xl font-bold text-navy sm:text-3xl">
                      {job.title}
                    </h1>
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                        <Link
                          href={`/companies/${companySlug}`}
                          className="hover:text-royal"
                        >
                          {companyName}
                        </Link>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" aria-hidden="true" />
                        {location || "India"}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4" aria-hidden="true" />
                        {labelFor(WORK_MODE_LABEL, job.workMode)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" aria-hidden="true" />
                        {job.openings} opening{job.openings === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {companyStatus === "approved" ? (
                      <Badge tone="success">Verified company</Badge>
                    ) : null}
                    {job.isFeatured ? <Badge tone="teal">Featured</Badge> : null}
                    {job.isUrgent ? <Badge tone="warning">Urgent hiring</Badge> : null}
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Salary
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold text-teal">
                      {formatSalaryRange(
                        job.salaryMinPaise,
                        job.salaryMaxPaise,
                        job.salaryPeriod,
                        job.salaryHidden,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Experience
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-navy">
                      {formatExperience(
                        job.experienceMinYears,
                        job.experienceMaxYears,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Job type
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-navy">
                      {labelFor(JOB_TYPE_LABEL, job.jobType)}
                    </dd>
                  </div>
                </dl>
              </header>

              {skills.length > 0 ? (
                <Card className="mt-6">
                  <h2 className="text-base font-bold text-navy">Skills</h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <li key={skill}>
                        <Badge tone="navy">{skill}</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
<Card className="mt-6">
                <h2 className="text-base font-bold text-navy">About the role</h2>
                <div className="mt-3 space-y-4 text-sm leading-relaxed text-slate-700">
                  {job.description
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((paragraph, i) => (
                      <p key={i}>{paragraph}</p>
                    ))}
                </div>

                {job.responsibilities ? (
                  <ListBlock title="Responsibilities" body={job.responsibilities} />
                ) : null}
                {job.requirements ? (
                  <ListBlock title="Requirements" body={job.requirements} />
                ) : null}

                {job.educationRequirement ? (
                  <p className="mt-6 flex items-center gap-2 text-sm text-slate-700">
                    <GraduationCap className="h-4 w-4 text-navy" aria-hidden="true" />
                    {job.educationRequirement}
                  </p>
                ) : null}
              </Card>

              <Card className="mt-6">
                <h2 className="text-base font-bold text-navy">
                  About {companyName}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {found.companyAbout ??
                    "This employer has not added a description yet."}
                </p>
                <Link
                  href={`/companies/${companySlug}`}
                  className="mt-4 inline-block text-sm font-semibold text-royal hover:underline"
                >
                  View company profile
                </Link>
              </Card>
            </article>

            <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <ApplyPanel
                jobId={job.id}
                signedIn={Boolean(user)}
                verified={Boolean(user?.emailVerifiedAt)}
                alreadyApplied={alreadyApplied}
                saved={saved}
                resumes={resumeOptions}
              />
              <ReportJobButton jobId={job.id} />

              <Card>
                <h2 className="text-sm font-bold text-navy">Job details</h2>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <DetailRow
                    label="Posted on"
                    value={formatDate(job.publishedAt ?? job.createdAt)}
                  />
                  {job.deadline ? (
                    <DetailRow
                      label="Apply before"
                      value={formatDate(job.deadline)}
                      icon={
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      }
                    />
                  ) : null}
                  {found.categoryName ? (
                    <DetailRow label="Category" value={found.categoryName} />
                  ) : null}
                  <DetailRow
                    label="Work mode"
                    value={labelFor(WORK_MODE_LABEL, job.workMode)}
                  />
                </dl>
              </Card>
            </aside>
          </div>

          {relatedJobs.length > 0 ? (
            <section className="mt-14">
              <h2 className="text-xl font-bold text-navy">Similar jobs</h2>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {relatedJobs.map((relatedJob) => (
                  <JobCardView key={relatedJob.id} job={relatedJob} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ListBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-navy">{title}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        {body
          .split("\n")
          .filter(Boolean)
          .map((line, i) => (
            <li key={i}>{line}</li>
          ))}
      </ul>
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="flex items-center gap-1 font-semibold text-navy">
        {icon}
        {value}
      </dd>
    </div>
  );
}