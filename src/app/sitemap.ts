import type { MetadataRoute } from "next";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogPosts, categories, companies, jobs } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const STATIC_PATHS = [
  { path: "", priority: 1 },
  { path: "/jobs", priority: 0.9 },
  { path: "/blog", priority: 0.6 },
  { path: "/companies", priority: 0.8 },
  { path: "/salary-insights", priority: 0.5 },
  { path: "/pricing", priority: 0.7 },
  { path: "/about", priority: 0.5 },
  { path: "/faq", priority: 0.5 },
  { path: "/contact", priority: 0.4 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
  { path: "/refund-policy", priority: 0.3 },
];

/** Sitemap covering static pages, categories, companies, jobs and blog posts. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getEnv().APP_URL.replace(/\/+$/, "");
  const settings = await getSiteSettings();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((item) => ({
    url: `${base}${item.path}`,
    lastModified: now,
    changeFrequency: item.path === "" ? "daily" : "weekly",
    priority: item.priority,
  }));

  const [categoryRows, companyRows, jobRows, postRows] = await Promise.all([
    db
      .select({ slug: categories.slug, updatedAt: categories.updatedAt })
      .from(categories)
      .where(eq(categories.isActive, true)),
    db
      .select({ slug: companies.slug, updatedAt: companies.updatedAt })
      .from(companies)
      .where(and(eq(companies.status, "approved"), isNull(companies.deletedAt))),
    db
      .select({ slug: jobs.slug, updatedAt: jobs.updatedAt })
      .from(jobs)
      .innerJoin(companies, eq(jobs.companyId, companies.id))
      .where(and(
        eq(jobs.status, "published"),
        isNull(jobs.deletedAt),
        eq(companies.status, "approved"),
        isNull(companies.deletedAt),
      ))
      .limit(5000),
    settings.featureBlog
      ? db
          .select({ slug: blogPosts.slug, updatedAt: blogPosts.updatedAt })
          .from(blogPosts)
          .where(and(eq(blogPosts.status, "published"), isNotNull(blogPosts.publishedAt)))
      : Promise.resolve([]),
  ]);

  for (const row of categoryRows) {
    entries.push({
      url: `${base}/jobs?category=${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const row of companyRows) {
    entries.push({
      url: `${base}/companies/${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const row of jobRows) {
    entries.push({
      url: `${base}/jobs/${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }
  for (const row of postRows) {
    entries.push({
      url: `${base}/blog/${row.slug}`,
      lastModified: row.updatedAt,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  return entries;
}
