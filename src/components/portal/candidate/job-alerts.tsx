'use client';

import { useState } from 'react';
import { portalDelete, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { JobAlert } from '@/lib/portal-client/types';
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
 * Job alerts.
 *
 * An alert stores real criteria, which the backend matches with a real database
 * query. DELIVERY is a scheduled-worker concern, so this page is explicit that
 * creating an alert does not send an email now — it starts matching.
 */
export function JobAlerts(): React.ReactElement {
  const alerts = useAsync(() => portalGet<{ items: JobAlert[] }>('/api/portal/candidate/alerts'), []);

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    name: '',
    keywords: '',
    location: '',
    skills: '',
    experienceMinYears: '',
    experienceMaxYears: '',
    employmentType: '',
    workMode: '',
    frequency: 'weekly',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = alerts.data?.items ?? [];

  async function create(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (values.name.trim().length === 0) {
      setError('Give the alert a name, for example "Backend roles in Bengaluru".');
      return;
    }
    setBusy(true);
    try {
      await portalSend('POST', '/api/portal/candidate/alerts', {
        name: values.name.trim(),
        keywords: values.keywords.trim() || null,
        location: values.location.trim() || null,
        skills: values.skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
        experienceMinYears: values.experienceMinYears
          ? Number(values.experienceMinYears)
          : null,
        experienceMaxYears: values.experienceMaxYears
          ? Number(values.experienceMaxYears)
          : null,
        employmentType: values.employmentType || null,
        workMode: values.workMode || null,
        frequency: values.frequency,
      });
      setValues({
        name: '',
        keywords: '',
        location: '',
        skills: '',
        experienceMinYears: '',
        experienceMaxYears: '',
        employmentType: '',
        workMode: '',
        frequency: 'weekly',
      });
      setOpen(false);
      await alerts.reload();
      setMessage('Alert created. Ravelyth will match new roles against it on your chosen schedule.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(alert: JobAlert): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await portalSend('PUT', '/api/portal/candidate/alerts', {
        alertId: alert.id,
        isActive: !alert.isActive,
      });
      await alerts.reload();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(alert: JobAlert): Promise<void> {
    if (!window.confirm(`Delete the alert "${alert.name}"?`)) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const result = await portalDelete<{ removed: boolean }>('/api/portal/candidate/alerts', {
        alertId: alert.id,
      });
      await alerts.reload();
      setMessage(result.removed ? 'Alert deleted.' : 'That alert was already gone.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job alerts"
        title="Your job alerts"
        description="Save the criteria you care about. Ravelyth matches new roles against them on the schedule you choose."
        action={
          <Button onClick={() => setOpen((value) => !value)}>
            {open ? 'Cancel' : 'Create an alert'}
          </Button>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Alert kind="info">
        Creating an alert does not send an email immediately. Alerts are matched by a scheduled job,
        so the first run happens on your chosen schedule.
      </Alert>

      {open ? (
        <Card>
          <CardHeader title="New alert" />
          <form onSubmit={create} noValidate className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Alert name" htmlFor="a-name">
                <input
                  id="a-name"
                  className={inputClass}
                  value={values.name}
                  onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
                  placeholder="Backend roles in Bengaluru"
                />
              </Field>
              <Field label="Keywords" htmlFor="a-keywords">
                <input
                  id="a-keywords"
                  className={inputClass}
                  value={values.keywords}
                  onChange={(event) => setValues((v) => ({ ...v, keywords: event.target.value }))}
                />
              </Field>
              <Field label="Location" htmlFor="a-location">
                <input
                  id="a-location"
                  className={inputClass}
                  value={values.location}
                  onChange={(event) => setValues((v) => ({ ...v, location: event.target.value }))}
                />
              </Field>
              <Field label="Skills" htmlFor="a-skills" hint="Comma separated.">
                <input
                  id="a-skills"
                  className={inputClass}
                  value={values.skills}
                  onChange={(event) => setValues((v) => ({ ...v, skills: event.target.value }))}
                />
              </Field>
              <Field label="Experience from (years)" htmlFor="a-min">
                <input
                  id="a-min"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={values.experienceMinYears}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, experienceMinYears: event.target.value }))
                  }
                />
              </Field>
              <Field label="Experience to (years)" htmlFor="a-max">
                <input
                  id="a-max"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={values.experienceMaxYears}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, experienceMaxYears: event.target.value }))
                  }
                />
              </Field>
              <Field label="Employment type" htmlFor="a-type">
                <select
                  id="a-type"
                  className={inputClass}
                  value={values.employmentType}
                  onChange={(event) =>
                    setValues((v) => ({ ...v, employmentType: event.target.value }))
                  }
                >
                  <option value="">Any</option>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                </select>
              </Field>
              <Field label="Work mode" htmlFor="a-mode">
                <select
                  id="a-mode"
                  className={inputClass}
                  value={values.workMode}
                  onChange={(event) => setValues((v) => ({ ...v, workMode: event.target.value }))}
                >
                  <option value="">Any</option>
                  <option value="onsite">On site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </Field>
              <Field label="How often" htmlFor="a-freq">
                <select
                  id="a-freq"
                  className={inputClass}
                  value={values.frequency}
                  onChange={(event) => setValues((v) => ({ ...v, frequency: event.target.value }))}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </Field>
            </div>
            <Button type="submit" loading={busy}>
              Create alert
            </Button>
          </form>
        </Card>
      ) : null}

      {alerts.loading ? <LoadingState label="Loading your alerts…" /> : null}
      {alerts.error ? <ErrorState message={alerts.error} onRetry={alerts.reload} /> : null}

      {!alerts.loading && !alerts.error && items.length === 0 ? (
        <EmptyState
          title="You have no job alerts"
          description="Create one above and Ravelyth will match new roles against your criteria."
        />
      ) : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader title={`${items.length} alert${items.length === 1 ? '' : 's'}`} />
          <ul className="divide-y divide-line">
            {items.map((alert) => (
              <li key={alert.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{alert.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[
                        alert.keywords,
                        alert.location,
                        alert.employmentType?.replace(/_/g, ' '),
                        alert.workMode,
                        alert.skills.join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No filters set — matches every new role'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {alert.frequency === 'daily' ? 'Daily' : 'Weekly'} ·{' '}
                      {alert.lastRunAt
                        ? `last matched ${formatDate(alert.lastRunAt)}`
                        : 'not run yet'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        alert.isActive
                          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 ring-slate-700'
                      }
                    >
                      {alert.isActive ? 'Active' : 'Paused'}
                    </Badge>
                    <Button variant="secondary" size="sm" loading={busy} onClick={() => toggle(alert)}>
                      {alert.isActive ? 'Pause' : 'Resume'}
                    </Button>
                    <Button variant="ghost" size="sm" loading={busy} onClick={() => remove(alert)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
