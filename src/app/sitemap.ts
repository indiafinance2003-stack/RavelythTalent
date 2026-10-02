import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';
import { serviceSlugs } from '@/lib/plans/services';
import { listPublicArticleSlugs, listPublicCategories } from '@/lib/kb/service';
import { searchJobs } from '@/lib/portal/jobs/search';

// Every URL listed here corresponds to an actual public page. Authentication
// and account pages are intentionally excluded (they are noindex utility
// pages, and /account requires a session).
const toolPaths = [
  '/dns/lookup',
  '/dns/analyze',
  '/dns/spf',
  '/dns/dkim',
  '/dns/dmarc',
  '/dns/ptr',
  '/dns/resolvers',
  '/email/analyze',
];

const infoPaths = [
  '/docs',
  '/docs/about',
  '/pricing',
  '/services',
  '/about',
  '/control',
  '/guides/dns',
  '/guides/email',
  '/faq',
  '/privacy',
  '/terms',
  '/security',
  '/contact',
  // Ravelyth Talent — the Part 2 public job board. This is the ONE canonical
  // public job experience. The older agency-curated board at /talent/jobs has
  // been consolidated onto it with a permanent redirect, so it is deliberately
  // absent here: listing a URL that only ever 308s would tell search engines to
  // index a redirect.
  '/jobs',
  // Ravelyth Talent — the policy set. These are indexable on purpose: the terms
  // a user is asked to accept have to be readable without an account.
  '/legal',
  '/legal/terms',
  '/legal/privacy',
  '/legal/candidate-consent',
  '/legal/employer-terms',
  '/legal/job-posting-policy',
  '/legal/cancellation',
  // Ravelyth Talent — the employer-facing services page. It is marketing copy
  // about recruiting services, not a second job board, so it stands on its own.
  '/talent',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Published Knowledge Base articles and service detail pages are real public
  // pages. KB reads fail soft (empty list) when the database is unavailable so
  // the sitemap still renders.
  const articleSlugs = await listPublicArticleSlugs();
  const categorySlugs = (await listPublicCategories()).data.map((category) => category.slug);
  const servicePathSlugs = serviceSlugs();

  // Published jobs on the canonical board. Like the KB, this fails soft (an
  // empty list) so a database outage can never take down the sitemap route.
  let publishedJobIds: string[] = [];
  try {
    publishedJobIds = (await searchJobs({ page: 1, pageSize: 500 })).items.map((job) => job.id);
  } catch {
    publishedJobIds = [];
  }

  return [
    { url: `${config.APP_URL}/`, changeFrequency: 'weekly', priority: 1 },
    ...toolPaths.map((path) => ({
      url: `${config.APP_URL}${path}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...servicePathSlugs.map((slug) => ({
      url: `${config.APP_URL}/services/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...articleSlugs.map((slug) => ({
      url: `${config.APP_URL}/docs/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
    ...categorySlugs.map((slug) => ({
      url: `${config.APP_URL}/docs/category/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...infoPaths.map((path) => ({
      url: `${config.APP_URL}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
    ...publishedJobIds.map((jobId) => ({
      url: `${config.APP_URL}/jobs/${jobId}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ];
}
