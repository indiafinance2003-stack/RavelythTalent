'use client';

import { useEffect, useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { CandidatePreferences } from '@/lib/portal-client/types';
import { minorToInput, parseMoneyToMinor } from '@/lib/portal-client/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  inputClass,
} from '@/components/portal/ui';

/**
 * Job preferences.
 *
 * These drive matching for alerts and recommendations. Lists are stored as
 * normalised, de-duplicated arrays, so the UI sends plain comma-separated text
 * and lets the server do the normalising rather than shipping near-duplicate
 * chips.
 *
 * Note the honest separation: `jobAlertEnabled` here controls whether the
 * candidate WANTS alerts; it does not by itself create one. Alerts themselves
 * are managed under Job alerts.
 */
export function PreferencesForm(): React.ReactElement {
  const preferences = useAsync(
    () => portalGet<{ preferences: CandidatePreferences | null }>('/api/portal/candidate/preferences'),
    []
  );

  const [values, setValues] = useState({
    locations: '',
    jobTypes: '',
    workModes: '',
    industries: '',
    minSalary: '',
    alertFrequency: 'weekly',
    jobAlertEnabled: true,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Populate the form once, from the server's data.
  useEffect(() => {
    if (loaded || !preferences.data) return;
    const current = preferences.data.preferences;
    if (!current) return;
    setValues({
      locations: current.preferredLocations.join(', '),
      jobTypes: current.preferredJobTypes.join(', '),
      workModes: current.preferredWorkModes.join(', '),
      industries: current.preferredIndustries.join(', '),
      minSalary: minorToInput(current.minSalaryMinor),
      alertFrequency: current.alertFrequency,
      jobAlertEnabled: current.jobAlertEnabled,
    });
    setLoaded(true);
  }, [preferences.data, loaded]);

  if (preferences.loading) return <LoadingState label="Loading your preferences…" />;
  if (preferences.error) return <ErrorState message={preferences.error} onRetry={preferences.reload} />;

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const salary = values.minSalary.trim();
    const minSalaryMinor = salary ? parseMoneyToMinor(salary) : null;
    if (salary && minSalaryMinor === null) {
      setError('Minimum salary must be a number, for example 1200000.');
      return;
    }

    setSaving(true);
    try {
      await portalSend('PUT', '/api/portal/candidate/preferences', {
        preferredLocations: splitList(values.locations),
        preferredJobTypes: splitList(values.jobTypes),
        preferredWorkModes: splitList(values.workModes),
        preferredIndustries: splitList(values.industries),
        minSalaryMinor,
        alertFrequency: values.alertFrequency,
        jobAlertEnabled: values.jobAlertEnabled,
      });
      setSaved(true);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card>
        <CardHeader
          title="What you are looking for"
          description="Used to match you with relevant roles and to filter job alerts."
        />
        <div className="space-y-4 p-5">
          {error ? <Alert kind="error">{error}</Alert> : null}
          {saved ? <Alert kind="success">Your preferences have been saved.</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred locations" htmlFor="pref-locations" hint="Comma separated.">
              <input
                id="pref-locations"
                className={inputClass}
                value={values.locations}
                onChange={(event) => setValues((v) => ({ ...v, locations: event.target.value }))}
                placeholder="Bengaluru, Remote"
              />
            </Field>
            <Field label="Preferred job types" htmlFor="pref-types" hint="Comma separated.">
              <input
                id="pref-types"
                className={inputClass}
                value={values.jobTypes}
                onChange={(event) => setValues((v) => ({ ...v, jobTypes: event.target.value }))}
                placeholder="full_time, contract"
              />
            </Field>
            <Field label="Preferred work modes" htmlFor="pref-modes" hint="Comma separated.">
              <input
                id="pref-modes"
                className={inputClass}
                value={values.workModes}
                onChange={(event) => setValues((v) => ({ ...v, workModes: event.target.value }))}
                placeholder="remote, hybrid"
              />
            </Field>
            <Field label="Preferred industries" htmlFor="pref-industries" hint="Comma separated.">
              <input
                id="pref-industries"
                className={inputClass}
                value={values.industries}
                onChange={(event) => setValues((v) => ({ ...v, industries: event.target.value }))}
              />
            </Field>
            <Field label="Minimum salary (₹ per year)" htmlFor="pref-salary">
              <input
                id="pref-salary"
                inputMode="numeric"
                className={inputClass}
                value={values.minSalary}
                onChange={(event) => setValues((v) => ({ ...v, minSalary: event.target.value }))}
              />
            </Field>
            <Field label="Alert frequency" htmlFor="pref-frequency">
              <select
                id="pref-frequency"
                className={inputClass}
                value={values.alertFrequency}
                onChange={(event) =>
                  setValues((v) => ({ ...v, alertFrequency: event.target.value }))
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.jobAlertEnabled}
              onChange={(event) =>
                setValues((v) => ({ ...v, jobAlertEnabled: event.target.checked }))
              }
              className="h-4 w-4 accent-[#2563eb]"
            />
            <span className="text-sm text-slate-300">I want to receive job alerts</span>
          </label>

          <Button type="submit" loading={saving}>
            Save preferences
          </Button>
        </div>
      </Card>
    </form>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
