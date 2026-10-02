'use client';

import { useState } from 'react';
import { portalGet } from '@/lib/portal-client/client';
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  formatDateTime,
  titleCase,
} from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminApplicationRow } from '@/lib/portal-client/types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  inputClass,
  labelClass,
} from '@/components/portal/ui';
import { PageNav } from '@/components/portal/admin/pager';

/**
 * The platform-wide application view, for moderation and dispute handling.
 *
 * This screen is deliberately READ-ONLY, and that is a policy decision rather
 * than a missing feature. An application status is the employer's decision
 * about their own vacancy; letting an administrator move a candidate through a
 * pipeline would put the platform in the position of claiming a hiring decision
 * it did not make and cannot account for. If something is wrong here, the fix is
 * on the employer's side where the decision was recorded.
 */
export function AdminApplications(): React.ReactElement {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);

  const applications = useAsync(
    () =>
      portalGet<{ items: AdminApplicationRow[] }>(
        `/api/portal/admin/applications?limit=25&offset=${offset}${status ? `&status=${status}` : ''}`
      ),
    [status, offset]
  );

  const items = applications.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Applications"
        description="A read-only platform-wide view, for moderation and disputes. Statuses are changed by the employer, never from here."
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <label className={labelClass} htmlFor="aa-status">
              Status
            </label>
            <select
              id="aa-status"
              className={inputClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All applications</option>
              <option value="submitted">Submitted</option>
              <option value="screening">Screening</option>
              <option value="interview">Interview</option>
              <option value="offered">Offered</option>
              <option value="hired">Hired</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} on this page</p>
        </div>
      </Card>

      {applications.loading ? <LoadingState label="Loading applications…" /> : null}
      {applications.error ? (
        <ErrorState message={applications.error} onRetry={applications.reload} />
      ) : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Candidate</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((application) => (
                <tr key={application.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{application.jobTitle}</p>
                    <p className="text-xs text-slate-500">Company {application.companyId}</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{application.candidateId}</td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={
                        APPLICATION_STATUS_TONES[
                          application.status as keyof typeof APPLICATION_STATUS_TONES
                        ] ?? 'bg-slate-800 text-slate-300 ring-slate-600'
                      }
                    >
                      {APPLICATION_STATUS_LABELS[
                        application.status as keyof typeof APPLICATION_STATUS_LABELS
                      ] ?? titleCase(application.status)}
                    </Badge>
                    {application.employerNotes ? (
                      <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                        Note: {application.employerNotes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {formatDateTime(application.appliedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && !applications.loading ? (
          <div className="p-5">
            <EmptyState title="No applications match this filter" />
          </div>
        ) : null}
      </Card>

      <PageNav offset={offset} hasNext={items.length === 25} onChange={setOffset} />
    </div>
  );
}
