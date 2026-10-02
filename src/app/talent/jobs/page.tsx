import { permanentRedirect } from 'next/navigation';

/**
 * /talent/jobs is REDIRECTED to /jobs.
 *
 * There were two public job boards reading two different tables. `/jobs` is the
 * canonical one: it is the Ravelyth Talent board backed by the portal `jobs`
 * table, with server-side filtering, pagination, saved jobs, alerts and the
 * authenticated application flow, and it is the route the header, the sitemap
 * and the root metadata already point at.
 *
 * This route backed the older agency-curated `talent_jobs` table. That data and
 * the authenticated console that manages it (`/owner/talent`) are untouched --
 * only the duplicate PUBLIC board is retired, so there is one place a candidate
 * can find and apply for a role.
 *
 * 308 (permanent) rather than a page that still renders: old URLs keep working,
 * search engines are told to consolidate, and the destination is never hidden.
 *
 * The candidate's search filters are deliberately NOT carried across, because the
 * two boards never shared a query vocabulary. Silently rewriting a search into a
 * differently-shaped one would show results the visitor did not ask for.
 */
export default function TalentJobsRedirect(): never {
  permanentRedirect('/jobs');
}
