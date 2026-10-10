import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Compass,
  Search,
  Sparkles,
  UserRoundPlus,
} from "lucide-react";
import { getCategoriesWithCounts, getTopCompanies } from "@/lib/companies/queries";
import { getFeaturedJobs, getLatestInternships, getLatestJobs } from "@/lib/jobs/queries";
import { getSiteSettings } from "@/lib/settings";
import { JobCardView } from "@/components/jobs/job-card";
import {
  Badge,
  ButtonLink,
  DecorCircles,
  EmptyState,
} from "@/components/ui/primitives";

const PILLARS = [
  {
    icon: Compass,
    title: "Find Jobs",
    description:
      "Search thousands of verified openings across India by role, city, salary and work mode.",
    href: "/jobs",
    cta: "Browse jobs",
  },
  {
    icon: BriefcaseBusiness,
    title: "Hire Talent",
    description:
      "Post roles, review applications in one pipeline and reach verified candidates across India.",
    href: "/register?role=recruiter",
    cta: "Start hiring",
  },
  {
    icon: UserRoundPlus,
    title: "Build Careers",
    description:
      "Build a complete profile, upload resumes and track every application in one place.",
    href: "/register",
    cta: "Create a profile",
  },
];

const STEPS = [
  {
    title: "Create your account",
    text: "Sign up as a job seeker or an employer. Verification takes one click.",
  },
  {
    title: "Find or post the right role",
    text: "Employers post verified jobs; seekers search with precise filters.",
  },
  {
    title: "Apply, shortlist, hire",
    text: "Easy Apply, live application tracking and interview scheduling.",
  },
];

export default async function HomePage() {
  const [settings, categories, featured, latest, internships, topCompanies] = await Promise.all([
    getSiteSettings(),
    getCategoriesWithCounts(20),
    getFeaturedJobs(6),
    getLatestJobs(6),
    getLatestInternships(6),
    getTopCompanies(6),
  ]);

  const shownJobs = featured.length > 0 ? featured : latest;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-sky-tint/40">
        <DecorCircles />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="teal" className="mb-5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {settings.tagline ?? "Connecting Great People with Great Opportunities"}
            </Badge>

            <h1 className="text-4xl font-extrabold leading-tight text-navy sm:text-5xl lg:text-6xl">
              Find the work that{" "}
              <span className="brand-gradient-text">moves you forward</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
              {settings.subTagline ??
                "Right People | Better Opportunities | Stronger Tomorrow"}
            </p>

            <form
              action="/jobs"
              method="get"
              role="search"
              className="mx-auto mt-8 flex max-w-2xl flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift sm:flex-row"
            >
              <label htmlFor="home-q" className="sr-only">
                Job title, skill or company
              </label>
              <input
                id="home-q"
                name="q"
                type="search"
                placeholder="Job title, skill or company"
                className="flex-1 rounded-xl border-0 px-3.5 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-royal/25"
              />
              <label htmlFor="home-location" className="sr-only">
                Location
              </label>
              <input
                id="home-location"
                name="location"
                type="text"
                placeholder="City or state"
                className="sm:w-44 rounded-xl border-0 px-3.5 py-2.5 text-sm text-navy placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-royal/25"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-royal px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-royal-600"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Search jobs
              </button>
            </form>

            <p className="mt-4 text-sm text-slate-500">
              Free for job seekers. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="surface p-7 transition hover:shadow-lift">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-royal-50 text-royal">
                <pillar.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-navy">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {pillar.description}
              </p>
              <Link
                href={pillar.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
              >
                {pillar.cta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-navy sm:text-3xl">
                Popular categories
              </h2>
              <p className="mt-1 text-slate-600">
                Explore openings across the industries hiring most in India.
              </p>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
            >
              View all jobs <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/jobs?category=${category.slug}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-offwhite px-4 py-3.5 transition hover:border-royal hover:bg-royal-50"
                >
                  <span className="text-sm font-semibold text-navy">
                    {category.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {category.openJobs}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Featured jobs */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-navy sm:text-3xl">
              Featured opportunities
            </h2>
            <p className="mt-1 text-slate-600">
              Hand-picked openings from verified employers.
            </p>
          </div>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
          >
            See more <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-8">
          {shownJobs.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {shownJobs.map((job) => (
                <JobCardView key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<BriefcaseBusiness className="h-10 w-10" aria-hidden="true" />}
              title="No job postings yet"
              description="Once employers start posting, featured roles will appear here."
              action={<ButtonLink href="/register?role=recruiter">Post the first job</ButtonLink>}
            />
          )}
        </div>
      </section>

      {/* Internships */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-navy sm:text-3xl">
                Latest internships
              </h2>
              <p className="mt-1 text-slate-600">
                Kick-start your career with paid and unpaid internships from
                verified companies.
              </p>
            </div>
            <Link
              href="/internships"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal hover:underline"
            >
              Browse internships <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-8">
            {internships.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {internships.map((job) => (
                  <JobCardView key={job.id} job={job} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Top companies */}
      {topCompanies.length > 0 ? (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-navy sm:text-3xl">
              Companies hiring now
            </h2>
            <p className="mt-1 text-slate-600">
              Verified employers with open roles on Ravelyth Talent.
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topCompanies.map((company) => (
                <li key={company.id}>
                  <Link
                    href={`/companies/${company.slug}`}
                    className="surface flex h-full items-start gap-4 p-5 transition hover:shadow-lift"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-tint text-sm font-extrabold text-navy">
                      {company.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold text-navy">{company.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-600">
                        {company.industry ?? "Hiring across India"}
                      </span>
                      <span className="mt-2 block text-xs font-semibold text-teal">
                        {company.openJobs} open {company.openJobs === 1 ? "role" : "roles"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="surface overflow-hidden">
          <div className="grid gap-8 p-8 md:grid-cols-3 md:p-10">
            {STEPS.map((step, index) => (
              <div key={step.title}>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-navy">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="relative overflow-hidden bg-navy py-16">
        <DecorCircles />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-200">
            Job seekers start free. Employers choose from plans built for growing
            teams, with monthly and annual billing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/pricing" variant="secondary" size="lg">
              View pricing
            </ButtonLink>
            <ButtonLink href="/register?role=recruiter" size="lg">
              Start hiring
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Script accent line */}
      <section className="bg-white py-16">
        <p className="mx-auto max-w-3xl px-4 text-center font-script text-3xl text-teal sm:text-4xl">
          Your Next Opportunity Awaits
        </p>
      </section>
    </>
  );
}