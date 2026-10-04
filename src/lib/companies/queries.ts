import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, companies, jobs } from "@/lib/db/schema";

/** Public company directory + job taxonomy helpers. */

export type CategoryWithCount = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  openJobs: number;
};

export async function getCategoriesWithCounts(
  limit?: number,
): Promise<CategoryWithCount[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      sortOrder: categories.sortOrder,
      openJobs: sql<number>`count(${jobs.id}) filter (
        where ${jobs.status} = 'published' and ${jobs.deletedAt} is null
      )::int`,
    })
    .from(categories)
    .leftJoin(jobs, eq(jobs.categoryId, categories.id))
    .where(and(eq(categories.isActive, true)))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder))
    .limit(limit ?? 20);

  return rows;
}

export type CompanyCard = {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
  industry: string | null;
  size: string | null;
  headquarters: string | null;
  about: string | null;
  averageRating: string | null;
  reviewsCount: number;
  openJobs: number;
  isFeatured: boolean;
};

export async function getTopCompanies(limit = 6): Promise<CompanyCard[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      logoPath: companies.logoPath,
      industry: companies.industry,
      size: companies.size,
      headquarters: companies.headquarters,
      about: companies.about,
      averageRating: companies.averageRating,
      reviewsCount: companies.reviewsCount,
      isFeatured: companies.isFeatured,
      openJobs: sql<number>`count(${jobs.id}) filter (where ${jobs.status} = 'published')::int`,
    })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .where(and(eq(companies.status, "approved"), isNull(companies.deletedAt)))
    .groupBy(companies.id)
    .orderBy(desc(companies.isFeatured), desc(sql`count(${jobs.id})`), companies.name)
    .limit(limit);

  return rows;
}

export async function listCompanies(input: {
  q?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<{ rows: CompanyCard[]; total: number; page: number; totalPages: number }> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 12, 1), 48);
  const page = Math.max(input.page ?? 1, 1);

  const conditions: SQL[] = [
    eq(companies.status, "approved"),
    isNull(companies.deletedAt),
  ];
  if (input.q?.trim()) {
    const like = `%${input.q.trim()}%`;
    conditions.push(
      sql<boolean>`(
        "companies"."name" ILIKE ${like}
        OR "companies"."industry" ILIKE ${like}
        OR "companies"."name" % ${input.q!.trim()}
      )`,
    );
  }
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        slug: companies.slug,
        logoPath: companies.logoPath,
        industry: companies.industry,
        size: companies.size,
        headquarters: companies.headquarters,
        about: companies.about,
        averageRating: companies.averageRating,
        reviewsCount: companies.reviewsCount,
        isFeatured: companies.isFeatured,
        openJobs: sql<number>`count(${jobs.id}) filter (where ${jobs.status} = 'published')::int`,
      })
      .from(companies)
      .leftJoin(jobs, eq(jobs.companyId, companies.id))
      .where(where)
      .groupBy(companies.id)
      .orderBy(desc(companies.isFeatured), companies.name)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(companies)
      .where(where),
  ]);

  const total = totals.at(0)?.value ?? 0;
  return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getApprovedCompanyBySlug(slug: string) {
  const rows = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.slug, slug),
        eq(companies.status, "approved"),
        isNull(companies.deletedAt),
      ),
    )
    .limit(1);
  return rows.at(0) ?? null;
}

export async function getCompanyJobCount(companyId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
      ),
    );
  return rows.at(0)?.value ?? 0;
}

/** Distinct cities/state pairs currently hiring, for search suggestions. */
export async function getPopularLocations(limit = 12): Promise<string[]> {
  const rows = await db
    .selectDistinct({ city: jobs.city, state: jobs.state })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        sql`${jobs.city} is not null`,
      ),
    )
    .limit(200);

  const tally = new Map<string, number>();
  for (const row of rows) {
    if (!row.city) continue;
    const key = row.state ? `${row.city}, ${row.state}` : row.city;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);
}