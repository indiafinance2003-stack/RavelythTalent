'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalDelete } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { SavedJob } from '@/lib/portal-client/types';
import { formatRelative, formatSalaryBand } from '@/lib/portal-client/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * Saved jobs.
 *
 * Removing reports the server's actual outcome: the endpoint is idempotent, so a
 * job that was already unsaved says so rather than the UI implying it removed
 * something that was not there.
 */
export function SavedJobs(): React.ReactElement {
  const saved = useAsync(() => portalGet<{ items: SavedJob[] }>('/api/portal/candidate/saved-jobs'), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = saved.data?.items ?? [];

  async function remove(jobId: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalDelete('/api/portal/candidate/saved-jobs', { jobId });
      await saved.reload();
      setMessage('Removed from saved jobs.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saved jobs"
        title="Jobs you have saved"
        description="Keep track of roles you want to come back to. Saving does not apply for you."
        action={
          <Link
            href="/jobs"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
          >
            Browse jobs
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {saved.loading ? <LoadingState label="Loading saved jobs…" /> : null}
      {saved.error ? <ErrorState message={saved.error} onRetry={saved.reload} /> : null}

      {!saved.loading && !saved.error && items.length === 0 ? (
        <EmptyState
          title="You have not saved any jobs yet"
          description="Save a role from the search results or a job page to keep it here."
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader title={`${items.length} saved job${items.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.jobId} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <Link
                    href={`/jobs/${item.jobId}`}
                    className="text-sm font-semibold text-ink hover:text-accent"
                  >
                    {item.title ?? 'Saved job'}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {item.companyName ?? ''}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Saved {formatRelative(item.savedAt)} ·{' '}
                    {formatSalaryBand(
                      item.salaryMinMinor ?? null,
                      item.salaryMaxMinor ?? null,
                      item.salaryPublic ?? false
                    )}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => remove(item.jobId)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
