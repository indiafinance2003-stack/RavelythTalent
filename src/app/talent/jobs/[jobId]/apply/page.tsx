import { permanentRedirect } from 'next/navigation';

/**
 * The legacy anonymous application page.
 *
 * Applying now happens on the canonical board at /jobs, which records the
 * application against a real employer and the candidate's own portal account. This
 * duplicate anonymous form is retired rather than kept as a second way in, because a
 * role applied for here would never reach the Part 2 application pipeline at all.
 *
 * Redirected permanently so a link already shared in a listing or an email still
 * reaches the live job board instead of a form that no longer exists.
 */
export default function LegacyApplyRedirect(): never {
  permanentRedirect('/jobs');
}
