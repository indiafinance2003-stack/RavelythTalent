'use client';

import Link from 'next/link';
import { Button } from '@/components/portal/ui';
import { useSavedJobs } from '@/components/portal/jobs/use-saved-jobs';

/**
 * The save action for a job.
 *
 * Takes its state from the shared `useSavedJobs` hook rather than holding its
 * own, so a list of job cards shows one consistent saved state and costs one
 * request instead of one per card.
 *
 * The control is only meaningful for a signed-in candidate, because saving
 * requires a candidate profile. For anyone else it renders an honest prompt to
 * sign in rather than a button that would fail — or, worse, a fake local
 * "saved" state that vanished on reload.
 */
export function SaveJobButton({
  jobId,
  title,
  className = '',
}: {
  jobId: string;
  title: string;
  className?: string;
}): React.ReactElement {
  const { canSave, signedIn, sessionLoading, isSaved, toggle, pendingId, error } = useSavedJobs();

  // While the session is still resolving we do not yet know whether this visitor
  // is a candidate. Rendering either branch now would flash "Sign in to save
  // this job" at a signed-in candidate on every page load, so the control stays
  // a disabled placeholder until the answer is known.
  if (sessionLoading) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-8 w-24 animate-pulse rounded-md bg-paper ${className}`}
      />
    );
  }

  if (!signedIn) {
    return (
      <Link
        href="/login"
        className={`text-sm text-accent-soft hover:text-accent ${className}`}
      >
        Sign in to save this job
      </Link>
    );
  }

  if (!canSave) {
    return (
      <p className={`text-xs text-slate-500 ${className}`}>
        Only candidate accounts can save jobs.
      </p>
    );
  }

  const saved = isSaved(jobId);
  const busy = pendingId === jobId;

  return (
    <div className={className}>
      <Button
        variant={saved ? 'secondary' : 'primary'}
        size="sm"
        loading={busy}
        // The accessible name says which job, because a page of these has
        // otherwise a row of identical "Save" buttons.
        title={`${saved ? 'Remove' : 'Save'} "${title}" ${saved ? 'from' : 'to'} your saved jobs`}
        onClick={() => void toggle(jobId)}
      >
        {saved ? 'Saved' : 'Save job'}
        <span className="sr-only">: {title}</span>
      </Button>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
