'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatDateTime, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminReportRow } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  inputClass,
  labelClass,
} from '@/components/portal/ui';
import { PageNav } from '@/components/portal/admin/pager';

/** A report's status, coloured by how much is left to do. */
function reportTone(status: string): string {
  if (status === 'open') return 'bg-red-500/10 text-red-300 ring-red-500/40';
  if (status === 'reviewing') return 'bg-amber-500/10 text-amber-300 ring-amber-500/40';
  if (status === 'resolved') return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40';
  return 'bg-slate-800 text-slate-300 ring-slate-600';
}

/**
 * The moderation report queue.
 *
 * Reports carry a resolution note, and resolving one is a statement to the
 * person who filed it about what was done. The dialog therefore requires text:
 * "resolved" with an empty explanation would close a report while leaving the
 * reporter with no idea whether anyone looked.
 *
 * A resolution is also not silent. It is written to the audit log with the acting
 * admin, so closing a report that should not have been closed is traceable.
 */
export function AdminReports(): React.ReactElement {
  const [status, setStatus] = useState('open');
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reports = useAsync(
    () =>
      portalGet<{ items: AdminReportRow[] }>(
        `/api/portal/admin/reports?limit=25&offset=${offset}${status ? `&status=${status}` : ''}`
      ),
    [status, offset]
  );

  async function resolve(report: AdminReportRow, decision: 'resolved' | 'dismissed'): Promise<void> {
    setError(null);
    setMessage(null);

    const resolution = window.prompt(
      decision === 'resolved'
        ? `What did you do about this report? The person who filed it sees this.`
        : `Why is this report being dismissed? The person who filed it sees this.`
    );
    if (resolution === null) return;
    if (resolution.trim().length === 0) {
      setError('A resolution note is required.');
      return;
    }

    setBusyId(report.id);
    try {
      await portalSend('PUT', `/api/portal/admin/reports?reportId=${report.id}`, {
        status: decision,
        resolution: resolution.trim(),
      });
      await reports.reload();
      setMessage(`Report ${decision === 'resolved' ? 'resolved' : 'dismissed'}.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const items = reports.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Reports"
        description="Moderation reports filed by candidates and employers. Resolving one requires a note for the reporter."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <label className={labelClass} htmlFor="ar-status">
              Status
            </label>
            <select
              id="ar-status"
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="open">Open</option>
              <option value="reviewing">Reviewing</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="">All reports</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} on this page</p>
        </div>
      </Card>

      {reports.loading ? <LoadingState label="Loading reports…" /> : null}
      {reports.error ? <ErrorState message={reports.error} onRetry={reports.reload} /> : null}

      {items.length === 0 && !reports.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState
              title={status === 'open' ? 'No open reports' : 'No reports match this filter'}
              description={status === 'open' ? 'Reports filed by users appear here.' : undefined}
            />
          </div>
        </Card>
      ) : null}

      {items.map((report) => (
        <Card key={report.id}>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{titleCase(report.reason)}</h3>
                <p className="text-xs text-slate-500">
                  About a {report.targetType.replace(/_/g, ' ')}
                  {report.targetId ? ` · ${report.targetId}` : ''}
                </p>
                <p className="text-xs text-slate-600">
                  Filed by {report.reporterUserId} · {formatDateTime(report.createdAt)}
                </p>
              </div>
              <Badge tone={reportTone(report.status)}>{titleCase(report.status)}</Badge>
            </div>

            <p className="whitespace-pre-wrap rounded-md bg-paper/60 px-3 py-2 text-sm text-slate-300">
              {report.description}
            </p>

            {report.resolution ? (
              <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                Resolution: {report.resolution}
                {report.resolvedAt ? ` · ${formatDateTime(report.resolvedAt)}` : ''}
              </p>
            ) : null}

            {report.status === 'open' || report.status === 'reviewing' ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busyId === report.id} onClick={() => resolve(report, 'resolved')}>
                  Mark resolved
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busyId === report.id}
                  onClick={() => resolve(report, 'dismissed')}
                >
                  Dismiss
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ))}

      <PageNav offset={offset} hasNext={items.length === 25} onChange={setOffset} />
    </div>
  );
}

