import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, jobs } from "@/lib/db/schema";

export const SALARY_INSIGHT_MIN_SAMPLE = 5;

export type SalaryInsight = {
  title: string;
  category: string | null;
  location: string;
  currency: string;
  sampleSize: number;
  annualMinPaise: number;
  annualMaxPaise: number;
};

export async function listSalaryInsights(): Promise<SalaryInsight[]> {
  const annualFactor = sql<number>`
    case ${jobs.salaryPeriod}
      when 'month' then 12
      when 'day' then 260
      when 'hour' then 2080
      else 1
    end
  `;
  const cityGroup = sql`coalesce(${jobs.city}, '')`;
  const stateGroup = sql`coalesce(${jobs.state}, '')`;
  const rows = await db
    .select({
      title: sql<string>`min(${jobs.title})`,
      category: categories.name,
      location: sql<string>`coalesce(nullif(trim(concat_ws(', ', ${jobs.city}, ${jobs.state})), ''), 'Location not specified')`,
      currency: jobs.salaryCurrency,
      sampleSize: sql<number>`count(*)::int`,
      annualMinPaise: sql<string>`floor(min(least(coalesce(${jobs.salaryMinPaise}, ${jobs.salaryMaxPaise}), coalesce(${jobs.salaryMaxPaise}, ${jobs.salaryMinPaise})) * ${annualFactor}))::bigint::text`,
      annualMaxPaise: sql<string>`ceil(max(greatest(coalesce(${jobs.salaryMinPaise}, ${jobs.salaryMaxPaise}), coalesce(${jobs.salaryMaxPaise}, ${jobs.salaryMinPaise})) * ${annualFactor}))::bigint::text`,
    })
    .from(jobs)
    .leftJoin(categories, eq(categories.id, jobs.categoryId))
    .where(
      and(
        eq(jobs.status, "published"),
        eq(jobs.salaryHidden, false),
        eq(jobs.salaryCurrency, "INR"),
        isNull(jobs.deletedAt),
        sql`coalesce(${jobs.salaryMinPaise}, ${jobs.salaryMaxPaise}) > 0`,
      ),
    )
    .groupBy(
      sql`lower(${jobs.title})`,
      categories.name,
      cityGroup,
      stateGroup,
      jobs.salaryCurrency,
      jobs.salaryPeriod,
    )
    .having(sql`count(*) >= ${SALARY_INSIGHT_MIN_SAMPLE}`)
    .orderBy(desc(sql`count(*)`), sql`min(${jobs.title})`)
    .limit(100);

  return rows.map((row) => ({
    ...row,
    sampleSize: Number(row.sampleSize),
    annualMinPaise: Number(row.annualMinPaise),
    annualMaxPaise: Number(row.annualMaxPaise),
  }));
}
