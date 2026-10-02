'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { Alert, Button, Card, CardHeader, Field, PageHeader, inputClass } from '@/components/portal/ui';

/**
 * File a report about a job, company, employer or candidate.
 *
 * The reporter is taken from the SESSION, never the body, so a complaint cannot
 * be filed in someone else's name.
 *
 * Filing a report deliberately does NOT hide the reported item or notify them.
 * That is a moderator decision made through the admin reports queue and written
 * to the audit log; this page says so rather than implying instant enforcement.
 */
export function ReportForm({ targetType, targetId }: { targetType: string; targetId: string }): React.ReactElement {
  const router = useRouter();
  const [reason, setReason] = useState('inappropriate_content');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await portalPost('/api/portal/reports', {
        targetType,
        targetId,
        reason,
        description: description.trim() || null,
      });
      // Only navigate once the report genuinely exists.
      router.push('/reports?filed=1');
      router.refresh();
    } catch (caught) {
      setError(formatApiError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Report"
        title="Report a problem"
        description="Tell us about a job posting, company or person that should not be here, or that is misleading."
      />

      <form onSubmit={submit} noValidate>
        <Card>
          <CardHeader
            title={`Reporting a ${targetType}`}
            description="A Ravelyth administrator reviews every report and records the outcome."
          />
          <div className="space-y-4 p-5">
            {error ? <Alert kind="error">{error}</Alert> : null}

            <Field label="What is wrong?" htmlFor="r-reason">
              <select
                id="r-reason"
                className={inputClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                <option value="inappropriate_content">Inappropriate content</option>
                <option value="misleading_or_scam">Misleading or a scam</option>
                <option value="discriminatory">Discriminatory or unfair</option>
                <option value="spam_or_duplicate">Spam or duplicate</option>
                <option value="copyright_or_trademark">Copyright or trademark issue</option>
                <option value="other">Something else</option>
              </select>
            </Field>

            <Field
              label="Details"
              htmlFor="r-description"
              hint="Anything that helps us act on this quickly."
            >
              <textarea
                id="r-description"
                rows={5}
                className={inputClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Alert kind="info">
              Filing this report does not remove the item. A moderator decides what happens next and
              the decision is recorded.
            </Alert>

            <Button type="submit" loading={busy}>
              Submit report
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
