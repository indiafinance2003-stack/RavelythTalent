'use client';

import { useState } from 'react';
import { portalGet } from '@/lib/portal-client/client';
import { formatDateTime, titleCase } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AuditLogEntry } from '@/lib/portal-client/types';
import {
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
 * The audit log.
 *
 * The action filter is built from the `actions` list the server returns rather
 * than a hard-coded set, so a newly added audited action becomes filterable here
 * without a frontend change, and a stale entry cannot appear that the server
 * would reject.
 *
 * Metadata is rendered as text, never as HTML. It is JSON written by server
 * code, but rendering it as markup would mean any place that puts user input
 * into metadata could inject script into the one screen every admin trusts.
 */
export function AdminAudit(): React.ReactElement {
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  const audit = useAsync(
    () =>
      portalGet<{ items: AuditLogEntry[]; actions: string[] }>(
        `/api/portal/admin/audit?limit=50&offset=${offset}${action ? `&action=${action}` : ''}`
      ),
    [action, offset]
  );

  const items = audit.data?.items ?? [];
  const actions = audit.data?.actions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Every security-relevant action taken on the platform, in the order it happened."
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[14rem] flex-1">
            <label className={labelClass} htmlFor="aa-action">
              Action
            </label>
            <select
              id="aa-action"
              className={inputClass}
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setOffset(0);
              }}
            >
              <option value="">All actions</option>
              {actions.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} on this page</p>
        </div>
      </Card>

      {audit.loading ? <LoadingState label="Loading the audit log…" /> : null}
      {audit.error ? <ErrorState message={audit.error} onRetry={audit.reload} /> : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                    {formatDateTime(entry.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-ink">{titleCase(entry.action)}</span>
                    {entry.ipAddress ? (
                      <p className="text-xs text-slate-600">from {entry.ipAddress}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {entry.actorUserId ?? 'system'}
                  </td>
                  <td className="px-5 py-3">
                    {entry.description ? (
                      <p className="text-xs text-slate-300">{entry.description}</p>
                    ) : null}
                    {entry.metadata && Object.keys(entry.metadata as object).length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-slate-500">Metadata</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper/60 p-2 text-xs text-slate-400">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && !audit.loading ? (
          <div className="p-5">
            <EmptyState title="No audit entries match this filter" />
          </div>
        ) : null}
      </Card>

      <PageNav offset={offset} limit={50} hasNext={items.length === 50} onChange={setOffset} />
    </div>
  );
}
