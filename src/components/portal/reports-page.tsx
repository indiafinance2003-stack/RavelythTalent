'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import { formatDate } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * The caller's own reports and a form to file a new one.
 *
 * The target id is entered by the person reporting, because a report can be
 * about anything they can see. The backend validates the target type against a
 * closed set and stores the reporter from the session.
 */
export function ReportsPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const justFiled = searchParams.get('filed') === '1';

  const reports = useAsync(() => portalGet<{ items: Array<{ id: string; targetType: string; targetId: string; reason: string; status: string; resolution: string | null; createdAt: string }> }>('/api/portal/reports'), []);
  const [targetType, setTargetType] = useState('job');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('inappropriate_content');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = reports.data?.items ?? [];

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (targetId.trim().length === 0) {
      setError('Paste the identifier of the item you are reporting.');
      return;
    }
    setBusy(true);
    try {
      await portalPost('/api/portal/reports', {
        targetType,
        targetId: targetId.trim(),
        reason,
        description: description.trim() || null,
      });
      setTargetId('');
      setDescription('');
      await reports.reload();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Reports and complaints"
        description="Report a job, company or person, and follow the outcome of reports you have filed."
      />

      {justFiled ? <Alert kind="success">Thank you. Your report has been recorded.</Alert> : null}

      <Card>
        <CardHeader
          title="File a report"
          description="Copy the identifier from the URL of the item you want to report."
        />
        <form onSubmit={submit} noValidate className="space-y-4 p-5">
          {error ? <Alert kind="error">{error}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What are you reporting?" htmlFor="n-type">
              <select
                id="n-type"
                className={inputClass}
                value={targetType}
                onChange={(event) => setTargetType(event.target.value)}
              >
                <option value="job">A job posting</option>
                <option value="company">A company</option>
                <option value="employer">An employer</option>
                <option value="candidate">A candidate</option>
              </select>
            </Field>
            <Field label="Identifier" htmlFor="n-id" hint="The id from the page URL.">
              <input
                id="n-id"
                className={inputClass}
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
              />
            </Field>
            <Field label="Reason" htmlFor="n-reason">
              <select
                id="n-reason"
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                <option value="inappropriate_content">Inappropriate content</option>
                <option value="misleading_or_scam">Misleading or a scam</option>
                <option value="discriminatory">Discriminatory or unfair</option>
                <option value="spam_or_duplicate">Spam or duplicate</option>
                <option value="copyright_or_trademark">Copyright or trademark</option>
                <option value="other">Something else</option>
              </select>
            </Field>
          </div>

          <Field label="Details" htmlFor="n-desc">
            <textarea
              id="n-desc"
              rows={4}
              className={inputClass}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <Button type="submit" loading={busy}>
            Submit report
          </Button>
        </form>
      </Card>

      {reports.loading ? <LoadingState label="Loading your reports…" /> : null}
      {reports.error ? <ErrorState message={reports.error} onRetry={reports.reload} /> : null}

      {!reports.loading && !reports.error && items.length === 0 ? (
        <EmptyState
          title="You have not filed any reports"
          description="Use the form above if something needs attention."
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader title="Reports you have filed" />
          <ul className="divide-y divide-line">
            {items.map((report) => (
              <li key={report.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {report.targetType.replace(/_/g, ' ')} · {report.reason.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-slate-500">Filed {formatDate(report.createdAt)}</p>
                  {report.resolution ? (
                    <p className="mt-2 text-sm text-slate-400">
                      <span className="text-slate-500">Outcome: </span>
                      {report.resolution}
                    </p>
                  ) : null}
                </div>
                <Badge
                  tone={
                    report.status === 'resolved'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                  }
                >
                  {report.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-slate-500">
        Reporting a job from its page?{' '}
        <Link href="/jobs" className="underline">
          Open the job
        </Link>{' '}
        and use the report option there.
      </p>
    </div>
  );
}
