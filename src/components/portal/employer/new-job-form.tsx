'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { portalGet, portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { parseMoneyToMinor } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AgencyClientsResponse, CreditBalance, EmployerJob } from '@/lib/portal-client/types';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Create a job.
 *
 * A draft is never live: this saves a draft, and submitting it for review is a
 * separate, explicit action that consumes a job credit. The status is decided
 * server-side, so there is no "publish" switch here that could bypass review.
 *
 * RECRUITMENT AGENCY: the client selector is only rendered when the API says
 * this company is a recruitment agency, and it is populated ONLY from the
 * agency's own authorised client list. There is no free-text company field and
 * no way to type an arbitrary id, so a user cannot submit a `postedForCompanyId`
 * the backend has not authorised. The backend re-checks it regardless.
 */
export function NewJobForm(): React.ReactElement {
  const router = useRouter();

  const jobs = useAsync(
    () => portalGet<{ items: EmployerJob[]; credits: CreditBalance }>('/api/portal/employer/jobs'),
    []
  );
  const clients = useAsync(
    () => portalGet<AgencyClientsResponse>('/api/portal/employer/company/clients'),
    []
  );

  const [values, setValues] = useState({
    title: '',
    department: '',
    employmentType: 'full_time',
    workMode: 'onsite',
    location: '',
    experienceMinYears: '',
    experienceMaxYears: '',
    salaryMin: '',
    salaryMax: '',
    salaryPublic: false,
    openings: '1',
    description: '',
    responsibilities: '',
    requirements: '',
    benefits: '',
    educationRequirements: '',
    skills: '',
    applicationDeadline: '',
    clientCompanyId: '',
  });

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const isAgency = clients.data?.companyType === 'recruitment_agency';
  const activeClients = (clients.data?.clients ?? []).filter((client) => client.status === 'active');
  const credits = jobs.data?.credits;

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate(): boolean {
    if (values.title.trim().length < 2) {
      setFieldError('Give the role a title.');
      return false;
    }
    if (values.description.trim().length < 10) {
      setFieldError('Describe the role in at least a sentence.');
      return false;
    }
    const min = values.experienceMinYears;
    const max = values.experienceMaxYears;
    if (min && max && Number(min) > Number(max)) {
      setFieldError('Minimum experience cannot be greater than maximum experience.');
      return false;
    }
    if (values.salaryMin && parseMoneyToMinor(values.salaryMin) === null) {
      setFieldError('Minimum salary must be a number, for example 800000.');
      return false;
    }
    if (values.salaryMax && parseMoneyToMinor(values.salaryMax) === null) {
      setFieldError('Maximum salary must be a number, for example 1200000.');
      return false;
    }
    if (values.salaryMin && values.salaryMax) {
      const lo = parseMoneyToMinor(values.salaryMin);
      const hi = parseMoneyToMinor(values.salaryMax);
      if (lo !== null && hi !== null && lo > hi) {
        setFieldError('Minimum salary cannot be greater than maximum salary.');
        return false;
      }
    }
    if (isAgency && !values.clientCompanyId) {
      setFieldError('Choose the client company this vacancy is for.');
      return false;
    }
    setFieldError(null);
    return true;
  }

  function payload(): Record<string, unknown> {
    return {
      title: values.title.trim(),
      department: values.department.trim() || null,
      employmentType: values.employmentType,
      workMode: values.workMode,
      location: values.location.trim() || null,
      experienceMinYears: values.experienceMinYears ? Number(values.experienceMinYears) : null,
      experienceMaxYears: values.experienceMaxYears ? Number(values.experienceMaxYears) : null,
      salaryMinMinor: values.salaryMin ? parseMoneyToMinor(values.salaryMin) : null,
      salaryMaxMinor: values.salaryMax ? parseMoneyToMinor(values.salaryMax) : null,
      salaryPublic: values.salaryPublic,
      openings: Number(values.openings) || 1,
      description: values.description.trim(),
      responsibilities: splitLines(values.responsibilities),
      requirements: splitLines(values.requirements),
      benefits: splitLines(values.benefits),
      educationRequirements: values.educationRequirements.trim() || null,
      skills: splitLines(values.skills),
      applicationDeadline: values.applicationDeadline || null,
      // Only ever a client the agency is already authorised for. A direct
      // employer never sends this field at all.
      ...(isAgency && values.clientCompanyId
        ? { postedForCompanyId: values.clientCompanyId }
        : {}),
    };
  }

  async function saveDraft(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      await portalPost('/api/portal/employer/jobs', payload());
      router.push('/employer/jobs?draft=1');
      router.refresh();
    } catch (caught) {
      setError(formatApiError(caught));
      setSaving(false);
    }
  }

  async function saveAndSubmit(): Promise<void> {
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      // Draft first, then submit for review: two real operations, because
      // submission consumes a credit and must not be implied by saving.
      const job = await portalPost<{ job: EmployerJob }>('/api/portal/employer/jobs', payload());
      await portalSend('PUT', '/api/portal/employer/jobs', { jobId: job.job.id });
      router.push('/employer/jobs?submitted=1');
      router.refresh();
    } catch (caught) {
      setError(formatApiError(caught));
      setSubmitting(false);
    }
  }

  if (jobs.loading || clients.loading) {
    return <LoadingState label="Loading the job formÃ¢â‚¬Â¦" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={isAgency ? 'Recruitment agency' : 'Employer'}
        title="Post a job"
        description="Save a draft and review it, or submit it straight away. Every posting is reviewed before it goes live."
        action={
          <Link href="/employer/jobs" className="text-sm text-slate-400 hover:text-accent">
            Back to jobs
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {fieldError ? <Alert kind="error">{fieldError}</Alert> : null}

      {credits && credits.available <= 0 ? (
        <Alert kind="warning">
          You have no job credits. You can still save a draft, but submitting it for review needs a
          credit.{' '}
          <Link href="/employer/packages" className="underline">
            Buy a package
          </Link>
          .
        </Alert>
      ) : null}

      {isAgency ? (
        <Alert kind="info">
          You are posting as a recruitment agency. Choose the client company this vacancy is for. Only
          clients you are authorised to represent are listed.
        </Alert>
      ) : null}

      <form onSubmit={saveDraft} noValidate>
        <Card>
          <CardHeader title="The role" />
          <div className="space-y-4 p-5">
            {isAgency ? (
              <Field
                label="This vacancy is for"
                htmlFor="j-client"
                hint="Only your authorised clients are listed. Ravelyth checks this again when the job is saved."
              >
                <select
                  id="j-client"
                  className={inputClass}
                  value={values.clientCompanyId}
                  onChange={(event) => update('clientCompanyId', event.target.value)}
                >
                  <option value="">Choose a client companyÃ¢â‚¬Â¦</option>
                  {activeClients.map((client) => (
                    <option key={client.clientCompanyId} value={client.clientCompanyId}>
                      {client.name}
                      {client.verified ? ' (verified)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" htmlFor="j-title">
                <input
                  id="j-title"
                  className={inputClass}
                  value={values.title}
                  onChange={(event) => update('title', event.target.value)}
                  placeholder="Senior Backend Engineer"
                />
              </Field>
              <Field label="Department" htmlFor="j-department">
                <input
                  id="j-department"
                  className={inputClass}
                  value={values.department}
                  onChange={(event) => update('department', event.target.value)}
                />
              </Field>
              <Field label="Employment type" htmlFor="j-type">
                <select
                  id="j-type"
                  className={inputClass}
                  value={values.employmentType}
                  onChange={(event) => update('employmentType', event.target.value)}
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                </select>
              </Field>
              <Field label="Work mode" htmlFor="j-mode">
                <select
                  id="j-mode"
                  className={inputClass}
                  value={values.workMode}
                  onChange={(event) => update('workMode', event.target.value)}
                >
                  <option value="onsite">On site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                </select>
              </Field>
              <Field label="Location" htmlFor="j-location">
                <input
                  id="j-location"
                  className={inputClass}
                  value={values.location}
                  onChange={(event) => update('location', event.target.value)}
                  placeholder="Bengaluru, India"
                />
              </Field>
              <Field label="Openings" htmlFor="j-openings">
                <input
                  id="j-openings"
                  type="number"
                  min={1}
                  max={1000}
                  className={inputClass}
                  value={values.openings}
                  onChange={(event) => update('openings', event.target.value)}
                />
              </Field>
              <Field label="Experience from (years)" htmlFor="j-min">
                <input
                  id="j-min"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={values.experienceMinYears}
                  onChange={(event) => update('experienceMinYears', event.target.value)}
                />
              </Field>
              <Field label="Experience to (years)" htmlFor="j-max">
                <input
                  id="j-max"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={values.experienceMaxYears}
                  onChange={(event) => update('experienceMaxYears', event.target.value)}
                />
              </Field>
              <Field label="Salary from (Ã¢â€šÂ¹ per year)" htmlFor="j-salary-min">
                <input
                  id="j-salary-min"
                  inputMode="numeric"
                  className={inputClass}
                  value={values.salaryMin}
                  onChange={(event) => update('salaryMin', event.target.value)}
                />
              </Field>
              <Field label="Salary to (Ã¢â€šÂ¹ per year)" htmlFor="j-salary-max">
                <input
                  id="j-salary-max"
                  inputMode="numeric"
                  className={inputClass}
                  value={values.salaryMax}
                  onChange={(event) => update('salaryMax', event.target.value)}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.salaryPublic}
                onChange={(event) => update('salaryPublic', event.target.checked)}
                className="h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-slate-300">
                Show the salary band on the public job page
              </span>
            </label>

            <Field label="About the role" htmlFor="j-description">
              <textarea
                id="j-description"
                rows={5}
                className={inputClass}
                value={values.description}
                onChange={(event) => update('description', event.target.value)}
                placeholder="What this role involves and who you are looking for."
              />
            </Field>

            <Field label="Responsibilities" htmlFor="j-resp" hint="One per line.">
              <textarea
                id="j-resp"
                rows={4}
                className={inputClass}
                value={values.responsibilities}
                onChange={(event) => update('responsibilities', event.target.value)}
              />
            </Field>

            <Field label="Requirements" htmlFor="j-req" hint="One per line.">
              <textarea
                id="j-req"
                rows={4}
                className={inputClass}
                value={values.requirements}
                onChange={(event) => update('requirements', event.target.value)}
              />
            </Field>

            <Field label="Benefits" htmlFor="j-benefits" hint="One per line.">
              <textarea
                id="j-benefits"
                rows={3}
                className={inputClass}
                value={values.benefits}
                onChange={(event) => update('benefits', event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Education requirements" htmlFor="j-education">
                <input
                  id="j-education"
                  className={inputClass}
                  value={values.educationRequirements}
                  onChange={(event) => update('educationRequirements', event.target.value)}
                />
              </Field>
              <Field label="Skills" htmlFor="j-skills" hint="Comma separated; used by job search.">
                <input
                  id="j-skills"
                  className={inputClass}
                  value={values.skills}
                  onChange={(event) => update('skills', event.target.value)}
                  placeholder="node, postgresql, aws"
                />
              </Field>
            </div>

            <Field
              label="Applications close"
              htmlFor="j-deadline"
              hint="Optional. After this the role stops accepting applications."
            >
              <input
                id="j-deadline"
                type="datetime-local"
                className={inputClass}
                value={values.applicationDeadline}
                onChange={(event) => update('applicationDeadline', event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit" loading={saving}>
            Save as draft
          </Button>
          <Button
            variant="secondary"
            onClick={saveAndSubmit}
            loading={submitting}
            disabled={credits !== undefined && credits.available <= 0}
            title={
              credits !== undefined && credits.available <= 0
                ? 'You need a job credit to submit a posting for review'
                : undefined
            }
          >
            Save and submit for review
          </Button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Submitting for review consumes one job credit
          {credits ? ` (you have ${credits.available})` : ''}. Ravelyth reviews every posting before it
          goes live, and you will be emailed either way.
        </p>
      </form>
    </div>
  );
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}