import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/**
 * The single canonical public job board.
 *
 * There used to be two public boards reading two different tables. `/jobs` won,
 * because it is the Ravelyth Talent board: server-side filtering, pagination,
 * saved jobs, alerts and the authenticated application flow, and it is what the
 * navigation, sitemap and root metadata point at.
 *
 * These assertions exist so a second board cannot quietly reappear. The failure
 * mode is not a broken link (a redirect still works) but two places a candidate
 * can find a job and disagree about what is real.
 */
describe('/jobs is the only public job board', () => {
  it('the legacy board and its detail and apply routes redirect permanently', () => {
    // 308 rather than 302: these are permanent moves, and search engines should
    // be told to drop the old URLs rather than re-check them.
    for (const route of [
      ['src', 'app', 'talent', 'jobs', 'page.tsx'],
      ['src', 'app', 'talent', 'jobs', '[jobId]', 'page.tsx'],
      ['src', 'app', 'talent', 'jobs', '[jobId]', 'apply', 'page.tsx'],
    ]) {
      const source = readSource(...route);
      expect(source).toMatch(/permanentRedirect\('\/jobs'\)/);
      // A retired route must not still render a board of its own.
      expect(source).not.toMatch(/listPublicJobs|getPublicJobByCode/);
    }
  });

  it('the sitemap advertises the canonical board and not the redirect', () => {
    const source = readSource('src', 'app', 'sitemap.ts');
    expect(source).toContain("'/jobs'");
    // Listing a URL that only ever 308s asks a crawler to index a redirect.
    expect(source).not.toContain("'/talent/jobs'");
    expect(source).not.toContain('/talent/jobs/');
    // Job detail URLs must be built from the canonical id space.
    expect(source).toContain('/jobs/${jobId}');
  });

  it('the header and the employer landing page link to the canonical board', () => {
    const header = readSource('src', 'components', 'layout', 'site-header.tsx');
    expect(header).toContain("href: '/jobs'");
    // No internal link should point a visitor at a route that only redirects.
    expect(header).not.toContain("href: '/talent/jobs'");

    const landing = readSource('src', 'app', 'talent', 'page.tsx');
    expect(landing).toContain('href="/jobs"');
    expect(landing).not.toContain('href="/talent/jobs"');
  });

  it('the agency console no longer claims publishing affects the public board', () => {
    // Leaving that claim would be a statement the app no longer honours.
    const ownerJob = readSource('src', 'app', 'owner', 'talent', 'jobs', '[id]', 'job-detail.tsx');
    expect(ownerJob).not.toContain('visible on /talent/jobs');
  });

  it('the canonical board and the authenticated dashboards are all preserved', () => {
    // Consolidation must not have removed working candidate/employer surface.
    for (const page of [
      ['src', 'app', 'jobs', 'page.tsx'],
      ['src', 'app', 'jobs', '[id]', 'page.tsx'],
      ['src', 'app', 'employer', 'jobs', 'page.tsx'],
      ['src', 'app', 'employer', 'jobs', 'new', 'page.tsx'],
      ['src', 'app', 'candidate', 'applications', 'page.tsx'],
      ['src', 'app', 'owner', 'talent', 'jobs', 'page.tsx'],
    ]) {
      expect(() => readSource(...page)).not.toThrow();
    }
  });
});
