'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalDelete, portalGet, portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useSession } from '@/lib/portal-client/use-session';

/**
 * Saved-job state, shared across every job card on a page.
 *
 * The set of saved job ids lives in ONE place rather than per-button, so a list
 * of twenty cards issues one request instead of twenty and stays consistent
 * while the user saves several jobs in a row.
 *
 * Nothing here is optimistic. `toggle` waits for the server's answer and then
 * adopts it, because saving is not free of consequences — it creates a row, and
 * the caller may be told the job was already saved. A button that flipped
 * instantly and then quietly reverted would misrepresent what happened.
 *
 * Anonymous visitors and non-candidates cannot save at all, so the hook reports
 * `canSave: false` instead of failing on click.
 */
export function useSavedJobs(): {
  canSave: boolean;
  signedIn: boolean;
  /**
   * True until the session has resolved.
   *
   * 'anonymous' and 'loading' are deliberately different states so a page of
   * job cards can render a neutral placeholder instead of flashing a sign-in
   * wall at a candidate who is simply still being authenticated.
   */
  sessionLoading: boolean;
  savedIds: Set<string>;
  pendingId: string | null;
  error: string | null;
  isSaved: (jobId: string) => boolean;
  toggle: (jobId: string) => Promise<void>;
  reload: () => Promise<void>;
} {
  const { user, status } = useSession();
  const isCandidate = user?.role === 'candidate';
  const signedIn = Boolean(user);

  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!isCandidate) {
      setSavedIds(new Set());
      return;
    }
    try {
      const result = await portalGet<{ items: Array<{ jobId: string }> }>(
        '/api/portal/candidate/saved-jobs',
        { limit: 100 }
      );
      setSavedIds(new Set(result.items.map((item) => item.jobId)));
    } catch {
      // A failed read must not look like "nothing is saved", so the set is
      // left empty and the user can still try to save.
      setSavedIds(new Set());
    }
  }, [isCandidate]);

  useEffect(() => {
    // 'loading' is a distinct state from 'anonymous' precisely so a page of
    // job cards does not flash "sign in to save" at a signed-in candidate
    // while the session is still resolving.
    if (status === 'loading') return;
    void load();
  }, [status, load]);

  async function toggle(jobId: string): Promise<void> {
    if (!isCandidate || pendingId) return;
    setError(null);
    setPendingId(jobId);
    try {
      if (savedIds.has(jobId)) {
        const result = await portalDelete<{ removed: boolean }>(
          '/api/portal/candidate/saved-jobs',
          { jobId }
        );
        setSavedIds((current) => {
          const next = new Set(current);
          // Only drop it if the server actually removed it.
          if (result.removed) next.delete(jobId);
          return next;
        });
      } else {
        const result = await portalPost<{ saved: boolean }>('/api/portal/candidate/saved-jobs', {
          jobId,
        });
        setSavedIds((current) => {
          const next = new Set(current);
          // `saved: false` means it was already saved, so the correct state is
          // still "saved" — the button was simply out of date.
          if (result.saved || savedIds.has(jobId)) next.add(jobId);
          return next;
        });
      }
    } catch (caught) {
      setError(formatApiError(caught));
      // Re-read rather than guess: the server is the only thing that knows
      // the real state after a failed write.
      await load();
    } finally {
      setPendingId(null);
    }
  }

  return {
    canSave: isCandidate,
    signedIn,
    sessionLoading: status === 'loading',
    savedIds,
    pendingId,
    error,
    isSaved: (jobId: string) => savedIds.has(jobId),
    toggle,
    reload: load,
  };
}
