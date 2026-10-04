import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';
import { searchJobs } from '@/lib/portal/jobs/search';

// Every URL listed here corresponds to an actual public page. Authentication
// and account pages are intentionally excluded (they are noindex utility
// pages, and portal areas require a session).
const infoPaths = [
  '/pricing',
  '/about',
  '/faq',
  '/privacy',
  '/terms',
  '/security',
  '/contact',
  // Ravelyth Talent — the public job board. This is the ONE canonical public
  // job experience. The older agency-curated board at /talent/jobs has been
  // consolidated onto it with a permanent redirect, so it is deliberately
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
  // Published jobs on the canonical board. This fails soft (an empty list) so a
  // database outage can never take down the sitemap route.
  let publishedJobIds: string[] = [];
  try {
    publishedJobIds = (await searchJobs({ page: 1, pageSize: 500 })).items.map((job) => job.id);
  } catch {
    publishedJobIds = [];
  }

  return [
    { url: `${config.APP_URL}/`, changeFrequency: 'weekly', priority: 1 },
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
