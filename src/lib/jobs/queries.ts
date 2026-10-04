import { and, count, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, companies, jobSkills, jobs, skills } from "@/lib/db/schema";

/**
 * Public job search.
 *
 * Relevance ranking combines PostgreSQL full text
 * (`jobs.search_vector` + websearch_to_tsquery), pg_trgm fuzzy matching and
 * boosts for featured/urgent jobs.
 */

export type JobSort = "relevance" | "newest";

export type JobSearchInput = {
  q?: string | undefined;
  location?: string | undefined;
  category?: string | undefined; // slug
  jobType?: string | undefined;
  workMode?: string | undefined;
  company?: string | undefined;
  /** Annual salary floor in paise. */
  salaryMin?: number | undefined;
  experienceMin?: number | undefined;
  experienceMax?: number | undefined;
  postedWithinDays?: number | undefined;
  sort?: JobSort | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type JobCard = {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  state: string | null;
  jobType: string;
  workMode: string;
  salaryMinPaise: number | null;
  salaryMaxPaise: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryHidden: boolean;
  experienceMinYears: string | null;
  experienceMaxYears: string | null;
  isFeatured: boolean;
  isUrgent: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  companyId: string;
  companyName: string;
  companySlug: string;
  companyLogoPath: string | null;
  companyStatus: string;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

const CARD_COLUMNS = {
  id: jobs.id,
  slug: jobs.slug,
  title: jobs.title,
  city: jobs.city,
  state: jobs.state,
  jobType: jobs.jobType,
  workMode: jobs.workMode,
  salaryMinPaise: jobs.salaryMinPaise,
  salaryMaxPaise: jobs.salaryMaxPaise,
  salaryCurrency: jobs.salaryCurrency,
  salaryPeriod: jobs.salaryPeriod,
  salaryHidden: jobs.salaryHidden,
  experienceMinYears: jobs.experienceMinYears,
  experienceMaxYears: jobs.experienceMaxYears,
  isFeatured: jobs.isFeatured,
  isUrgent: jobs.isUrgent,
  publishedAt: jobs.publishedAt,
  createdAt: jobs.createdAt,
  companyId: companies.id,
  companyName: companies.name,
  companySlug: companies.slug,
  companyLogoPath: companies.logoPath,
  companyStatus: companies.status,
  categoryId: categories.id,
  categoryName: categories.name,
  categorySlug: categories.slug,
};

export const JOB_SEARCH_PAGE_SIZE = 20;

function rankSql(query: string): SQL<number> {
  return sql<number>`(
    ts_rank_cd("jobs"."search_vector", websearch_to_tsquery('english', ${query}), 32)
    + CASE WHEN similarity("jobs"."title", ${query}) > 0.2 THEN 0.4 ELSE 0 END
    + CASE WHEN "jobs"."is_featured" THEN 0.5 ELSE 0 END
  )`;
}

function buildConditions(input: JobSearchInput): SQL[] {
  const conditions: SQL[] = [
    eq(jobs.status, "published"),
    isNull(jobs.deletedAt),
    eq(companies.status, "approved"),
    sql`("jobs"."expires_at" is null or "jobs"."expires_at" > now())`,
  ];

  const query = input.q?.trim();
  if (query) {
    conditions.push(
      sql<boolean>`(
        "jobs"."search_vector" @@ websearch_to_tsquery('english', ${query})
        OR "jobs"."title" % ${query}
        OR "jobs"."description" % ${query}
        OR similarity("jobs"."title", ${query}) > 0.3
      )`,
    );
  }

  if (input.location?.trim()) {
    const loc = `%${input.location.trim()}%`;
    conditions.push(
      sql<boolean>`(
        "jobs"."city" ILIKE ${loc}
        OR "jobs"."state" ILIKE ${loc}
        OR "jobs"."locations"::text ILIKE ${loc}
      )`,
    );
  }

  if (input.category?.trim()) conditions.push(eq(categories.slug, input.category.trim()));
  if (input.jobType?.trim()) conditions.push(eq(jobs.jobType, input.jobType as never));
  if (input.workMode?.trim()) conditions.push(eq(jobs.workMode, input.workMode as never));
  if (input.company?.trim()) {
    conditions.push(sql<boolean>`("companies"."name" ILIKE ${`%${input.company.trim()}%`})`);
  }
  if (typeof input.salaryMin === "number" && input.salaryMin > 0) {
    conditions.push(
      sql<boolean>`coalesce("jobs"."salary_max_paise", 0) >= ${input.salaryMin}`,
    );
  }
  if (typeof input.experienceMin === "number" && input.experienceMin > 0) {
    conditions.push(
      sql<boolean>`coalesce("jobs"."experience_max_years", 99) >= ${input.experienceMin}`,
    );
  }
  if (typeof input.experienceMax === "number" && input.experienceMax >= 0) {
    conditions.push(
      sql<boolean>`coalesce("jobs"."experience_min_years", 0) <= ${input.experienceMax}`,
    );
  }
  if (typeof input.postedWithinDays === "number" && input.postedWithinDays > 0) {
    conditions.push(
      sql<boolean>`coalesce("jobs"."published_at", "jobs"."created_at") >= now() - (${input.postedWithinDays} * interval '1 day')`,
    );
  }

  return conditions;
}

export type JobSearchResult = {
  rows: JobCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string | null;
};

export async function searchJobs(
  input: JobSearchInput,
): Promise<JobSearchResult> {
  const pageSize = Math.min(
    Math.max(input.pageSize ?? JOB_SEARCH_PAGE_SIZE, 1),
    50,
  );
  const page = Math.max(input.page ?? 1, 1);
  const query = input.q?.trim() || null;
  const where = and(...buildConditions(input));

  const rowsPromise = db
    .select(CARD_COLUMNS)
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(where)
    .orderBy(
      ...(query && input.sort !== "newest"
        ? [desc(rankSql(query)), desc(jobs.publishedAt)]
        : [desc(jobs.isFeatured), desc(jobs.publishedAt), desc(jobs.createdAt)]),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalPromise = db
    .select({ value: count() })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(where);

  const [rows, totals] = await Promise.all([rowsPromise, totalPromise]);
  const total = totals.at(0)?.value ?? 0;

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    query,
  };
}

/* -------------------------------------------------------------------------- */
/* Single job + related data                                                   */
/* -------------------------------------------------------------------------- */

export async function getPublishedJobBySlug(slug: string) {
  const rows = await db
    .select({
      job: jobs,
      companyId: companies.id,
      companyName: companies.name,
      companySlug: companies.slug,
      companyAbout: companies.about,
      companyLogoPath: companies.logoPath,
      companyWebsite: companies.website,
      companyIndustry: companies.industry,
      companySize: companies.size,
      companyHeadquarters: companies.headquarters,
      companyStatus: companies.status,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(
      and(
        eq(jobs.slug, slug),
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        eq(companies.status, "approved"),
      ),
    )
    .limit(1);

  return rows.at(0) ?? null;
}

export async function getJobSkillNames(jobId: string): Promise<string[]> {
  const rows = await db
    .select({ name: skills.name })
    .from(jobSkills)
    .innerJoin(skills, eq(skills.id, jobSkills.skillId))
    .where(eq(jobSkills.jobId, jobId));
  return rows.map((r) => r.name);
}

/* -------------------------------------------------------------------------- */
/* Home page data                                                             */
/* -------------------------------------------------------------------------- */

export async function getFeaturedJobs(limit = 6): Promise<JobCard[]> {
  const rows = await db
    .select(CARD_COLUMNS)
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(
      and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        eq(companies.status, "approved"),
        sql`("jobs"."expires_at" is null or "jobs"."expires_at" > now())`,
      ),
    )
    .orderBy(desc(jobs.isFeatured), desc(jobs.publishedAt), desc(jobs.createdAt))
    .limit(limit);
  return rows;
}

export async function getLatestJobs(limit = 6): Promise<JobCard[]> {
  const rows = await db
    .select(CARD_COLUMNS)
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(
      and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        eq(companies.status, "approved"),
        sql`("jobs"."expires_at" is null or "jobs"."expires_at" > now())`,
      ),
    )
    .orderBy(desc(jobs.publishedAt), desc(jobs.createdAt))
    .limit(limit);
  return rows;
}