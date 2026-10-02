import { permanentRedirect } from 'next/navigation';

/**
 * A legacy agency-curated role detail page.
 *
 * The public job board is now consolidated onto /jobs (see
 * src/app/talent/jobs/page.tsx for why). This route is kept only as a permanent
 * redirect so an old bookmark, a printed advert or an external link lands somewhere
 * that still works, rather than 404ing on a link a candidate trusted.
 *
 * The jobCode is NOT translated into a portal job id: the two boards read
 * different tables and share no identifier space, so there is no honest mapping to
 * make. Sending the visitor to the board to search is the truthful outcome. The role
 * data is untouched, as is the authenticated console that manages it.
 */
export default function LegacyJobRedirect(): never {
  permanentRedirect('/jobs');
}
