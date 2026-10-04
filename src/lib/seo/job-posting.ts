import { labelFor } from "@/lib/utils";

/**
 * schema.org JobPosting JSON-LD.
 *
 * Only facts we actually know are emitted - salary, address and company details
 * are never invented.
 */

const SALARY_UNIT: Record<string, string> = {
  year: "YEAR",
  month: "MONTH",
  day: "DAY",
  hour: "HOUR",
};

export type JobPostingInput = {
  job: {
    id: string;
    title: string;
    description: string;
    slug: string;
    workMode: string;
    jobType: string;
    experienceMinYears: string | null;
    experienceMaxYears: string | null;
    salaryMinPaise: number | null;
    salaryMaxPaise: number | null;
    salaryCurrency: string;
    salaryPeriod: string;
    salaryHidden: boolean;
    city: string | null;
    state: string | null;
    country: string | null;
    openings: number;
    publishedAt: Date | null;
    createdAt: Date;
    expiresAt: Date | null;
    categoryName: string | null;
  };
  companyName: string;
  companySlug: string;
  appUrl: string;
};

const EMPLOYMENT_TYPE: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
  freelance: "FREELANCE",
};

export function buildJobPostingJsonLd(input: JobPostingInput): string {
  const { job, companyName, companySlug, appUrl } = input;
  const base = appUrl.replace(/\/+$/, "");

  const description = job.description.replace(/<[^>]+>/g, " ").slice(0, 5000);

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: "Ravelyth Talent",
      value: job.id,
    },
    datePosted: (job.publishedAt ?? job.createdAt).toISOString(),
    validThrough: (job.expiresAt ?? job.createdAt).toISOString(),
    employmentType: EMPLOYMENT_TYPE[job.jobType] ?? "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: companyName,
      sameAs: `${base}/companies/${companySlug}`,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.city ?? "India",
        addressRegion: job.state ?? undefined,
        addressCountry: job.country ?? "IN",
      },
    },
    totalJobOpenings: job.openings,
    directApply: true,
  };

  if (job.categoryName) data.occupationalCategory = job.categoryName;

  if (!job.salaryHidden && (job.salaryMinPaise || job.salaryMaxPaise)) {
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: job.salaryCurrency || "INR",
      value: {
        "@type": "QuantitativeValue",
        minValue: (job.salaryMinPaise ?? job.salaryMaxPaise ?? 0) / 100,
        maxValue: (job.salaryMaxPaise ?? job.salaryMinPaise ?? 0) / 100,
        unitText: labelFor(SALARY_UNIT, job.salaryPeriod, "YEAR"),
      },
    };
  }

  if (job.experienceMinYears || job.experienceMaxYears) {
    data.experienceRequirements = `${job.experienceMinYears ?? 0} years - ${
      job.experienceMaxYears ?? "any"
    } years`;
  }

  if (job.workMode === "remote") data.jobLocationType = "TELECOMMUTE";

  return JSON.stringify(data);
}