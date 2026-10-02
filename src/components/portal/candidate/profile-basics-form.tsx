'use client';

import { useEffect, useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import type { CandidateProfile, ProfileResponse } from '@/lib/portal-client/types';
import { minorToInput, parseMoneyToMinor } from '@/lib/portal-client/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  inputClass,
} from '@/components/portal/ui';

/**
 * The personal part of the candidate profile.
 *
 * Completion is returned by the server after every save and is displayed from
 * that response, never recomputed in the browser. A client-side score would let
 * a candidate believe they are more complete than they are, which is exactly the
 * kind of quiet dishonesty this platform is meant to avoid.
 *
 * Salary fields are typed in rupees and converted to integer minor units before
 * being sent. A value that will not convert is refused rather than sent as 0.
 */
export function ProfileBasicsForm({
  initial,
  onSaved,
}: {
  initial: CandidateProfile;
  onSaved: (next: ProfileResponse) => void;
}): React.ReactElement {
  const [values, setValues] = useState({
    fullName: initial.fullName ?? '',
    phone: initial.phone ?? '',
    location: initial.location ?? '',
    dateOfBirth: initial.dateOfBirth ?? '',
    headline: initial.headline ?? '',
    summary: initial.summary ?? '',
    currentCompany: initial.currentCompany ?? '',
    currentJobTitle: initial.currentJobTitle ?? '',
    totalExperienceYears: initial.totalExperienceYears === null ? '' : String(initial.totalExperienceYears),
    currentCtc: minorToInput(initial.currentCtcMinor),
    expectedCtc: minorToInput(initial.expectedCtcMinor),
    noticePeriodDays: initial.noticePeriodDays === null ? '' : String(initial.noticePeriodDays),
    portfolioUrl: initial.portfolioUrl ?? '',
    linkedinUrl: initial.linkedinUrl ?? '',
    githubUrl: initial.githubUrl ?? '',
    profileVisibility: initial.profileVisibility,
    openToWork: initial.openToWork,
  });

  // Re-sync when the server returns a different profile (for example after a
  // section elsewhere changed it), without discarding in-progress edits.
  useEffect(() => {
    setValues((current) => ({ ...current, fullName: initial.fullName ?? '' }));
  }, [initial.fullName]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]): void {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    const years = values.totalExperienceYears.trim();
    if (years && (!/^\d+$/.test(years) || Number(years) > 70)) {
      setFieldError('Total experience must be a whole number of years between 0 and 70.');
      return;
    }

    const expected = values.expectedCtc.trim() ? parseMoneyToMinor(values.expectedCtc) : null;
    if (values.expectedCtc.trim() && expected === null) {
      setFieldError('Expected salary must be a number, for example 1800000.');
      return;
    }

    setSaving(true);
    try {
      const result = await portalSend<ProfileResponse>('PUT', '/api/portal/candidate/profile', {
        fullName: values.fullName.trim(),
        phone: values.phone.trim() || null,
        location: values.location.trim() || null,
        dateOfBirth: values.dateOfBirth || null,
        headline: values.headline.trim() || null,
        summary: values.summary.trim() || null,
        currentCompany: values.currentCompany.trim() || null,
        currentJobTitle: values.currentJobTitle.trim() || null,
        totalExperienceYears: years ? Number(years) : null,
        currentCtcMinor: values.currentCtc.trim() ? parseMoneyToMinor(values.currentCtc) : null,
        expectedCtcMinor: expected,
        noticePeriodDays: values.noticePeriodDays.trim() ? Number(values.noticePeriodDays) : null,
        portfolioUrl: values.portfolioUrl.trim() || null,
        linkedinUrl: values.linkedinUrl.trim() || null,
        githubUrl: values.githubUrl.trim() || null,
        profileVisibility: values.profileVisibility,
        openToWork: values.openToWork,
      });
      // Adopt the server's authoritative profile and completion.
      onSaved(result);
      setSaved(true);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {saved ? <Alert kind="success">Your profile has been saved.</Alert> : null}
      {fieldError ? <Alert kind="error">{fieldError}</Alert> : null}

      <Card>
        <CardHeader
          title="Personal information"
          description="How employers and recruiters identify you."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="p-name">
            <input
              id="p-name"
              className={inputClass}
              value={values.fullName}
              onChange={(event) => update('fullName', event.target.value)}
            />
          </Field>
          <Field label="Phone number" htmlFor="p-phone">
            <input
              id="p-phone"
              type="tel"
              className={inputClass}
              value={values.phone}
              onChange={(event) => update('phone', event.target.value)}
            />
          </Field>
          <Field label="Location" htmlFor="p-location">
            <input
              id="p-location"
              className={inputClass}
              value={values.location}
              onChange={(event) => update('location', event.target.value)}
              placeholder="Bengaluru, India"
            />
          </Field>
          <Field label="Date of birth" htmlFor="p-dob" hint="Optional. Used only for eligibility checks.">
            <input
              id="p-dob"
              type="date"
              className={inputClass}
              value={values.dateOfBirth}
              onChange={(event) => update('dateOfBirth', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Professional summary"
          description="A short headline and summary help employers decide quickly."
        />
        <div className="space-y-4 p-5">
          <Field label="Headline" htmlFor="p-headline" hint="For example: Senior Backend Engineer">
            <input
              id="p-headline"
              className={inputClass}
              value={values.headline}
              onChange={(event) => update('headline', event.target.value)}
            />
          </Field>
          <Field label="Summary" htmlFor="p-summary">
            <textarea
              id="p-summary"
              rows={5}
              className={inputClass}
              value={values.summary}
              onChange={(event) => update('summary', event.target.value)}
              placeholder="What you do, and what you are looking for next."
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Current role" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Current company" htmlFor="p-company">
            <input
              id="p-company"
              className={inputClass}
              value={values.currentCompany}
              onChange={(event) => update('currentCompany', event.target.value)}
            />
          </Field>
          <Field label="Current job title" htmlFor="p-title">
            <input
              id="p-title"
              className={inputClass}
              value={values.currentJobTitle}
              onChange={(event) => update('currentJobTitle', event.target.value)}
            />
          </Field>
          <Field label="Total experience (years)" htmlFor="p-years">
            <input
              id="p-years"
              type="number"
              min={0}
              max={70}
              className={inputClass}
              value={values.totalExperienceYears}
              onChange={(event) => update('totalExperienceYears', event.target.value)}
            />
          </Field>
          <Field label="Notice period (days)" htmlFor="p-notice">
            <input
              id="p-notice"
              type="number"
              min={0}
              className={inputClass}
              value={values.noticePeriodDays}
              onChange={(event) => update('noticePeriodDays', event.target.value)}
            />
          </Field>
          <Field label="Current CTC (₹ per year)" htmlFor="p-ctc">
            <input
              id="p-ctc"
              inputMode="numeric"
              className={inputClass}
              value={values.currentCtc}
              onChange={(event) => update('currentCtc', event.target.value)}
            />
          </Field>
          <Field label="Expected CTC (₹ per year)" htmlFor="p-expected">
            <input
              id="p-expected"
              inputMode="numeric"
              className={inputClass}
              value={values.expectedCtc}
              onChange={(event) => update('expectedCtc', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Links" description="Employers often check these before replying." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="LinkedIn" htmlFor="p-linkedin">
            <input
              id="p-linkedin"
              type="url"
              className={inputClass}
              value={values.linkedinUrl}
              onChange={(event) => update('linkedinUrl', event.target.value)}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field label="GitHub" htmlFor="p-github">
            <input
              id="p-github"
              type="url"
              className={inputClass}
              value={values.githubUrl}
              onChange={(event) => update('githubUrl', event.target.value)}
              placeholder="https://github.com/…"
            />
          </Field>
          <Field label="Portfolio" htmlFor="p-portfolio">
            <input
              id="p-portfolio"
              type="url"
              className={inputClass}
              value={values.portfolioUrl}
              onChange={(event) => update('portfolioUrl', event.target.value)}
              placeholder="https://"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Visibility" />
        <div className="space-y-4 p-5">
          <Field label="Who can see your profile" htmlFor="p-visibility">
            <select
              id="p-visibility"
              className={inputClass}
              value={values.profileVisibility}
              onChange={(event) =>
                update('profileVisibility', event.target.value as typeof values.profileVisibility)
              }
            >
              <option value="public">Anyone on Ravelyth Talent</option>
              <option value="employers">Employers who have your application</option>
              <option value="private">Only me</option>
            </select>
          </Field>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.openToWork}
              onChange={(event) => update('openToWork', event.target.checked)}
              className="h-4 w-4 accent-[#2563eb]"
            />
            <span className="text-sm text-slate-300">I am open to new opportunities</span>
          </label>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" loading={saving}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
