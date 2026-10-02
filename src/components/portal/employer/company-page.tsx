'use client';

import { useState } from 'react';
import { portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { EmployerCompany } from '@/lib/portal-client/types';
import { VERIFICATION_LABELS } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * The employer's own company profile.
 *
 * `verificationStatus` and `companyType` are deliberately NOT editable here. An
 * employer verifying itself, or reclassifying itself into a recruitment agency
 * so it could post for other companies, would defeat both features. Only an
 * admin can change either, through the admin routes.
 */
export function CompanyPage(): React.ReactElement {
  const company = useAsync(
    () => portalGet<{ company: EmployerCompany | null; members: Array<{ id: string; userId: string; memberRole: string }> }>('/api/portal/employer/company'),
    []
  );

  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const data = company.data?.company ?? null;
  const isAgency = data?.companyType === 'recruitment_agency';

  const current = values ?? (data
    ? {
        name: data.name ?? '',
        website: data.website ?? '',
        industry: data.industry ?? '',
        companySize: data.companySize ?? '',
        location: data.location ?? '',
        description: data.description ?? '',
        phone: data.phone ?? '',
        officialEmail: data.officialEmail ?? '',
        authorizedContactName: data.authorizedContactName ?? '',
        authorizedContactPhone: data.authorizedContactPhone ?? '',
      }
    : {});

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // PATCH, not PUT: the route implements a partial update, and a PUT here
      // would be answered with 405 and the employer could never save at all.
      await portalSend('PATCH', '/api/portal/employer/company', {
        name: current.name,
        website: current.website || null,
        industry: current.industry || null,
        companySize: current.companySize || null,
        location: current.location || null,
        description: current.description || null,
        phone: current.phone || null,
        officialEmail: current.officialEmail || null,
        authorizedContactName: current.authorizedContactName || null,
        authorizedContactPhone: current.authorizedContactPhone || null,
      });
      await company.reload();
      setValues(null);
      setMessage('Company details saved. A moderation team member reviews changes to identity details.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (company.loading) return <LoadingState label="Loading your company…" />;
  if (company.error) return <ErrorState message={company.error} onRetry={company.reload} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title={data?.name ?? 'Your company'}
        description={
          isAgency
            ? 'Your agency profile. Job postings are attributed to a client company you are authorised for.'
            : 'How your company appears to candidates on job postings.'
        }
      />

      {!data ? (
        <Alert kind="warning">
          No company is linked to this account yet. Contact Ravelyth support to have one created.
        </Alert>
      ) : null}

      {data ? (
        <Card>
          <CardHeader title="Account status" />
          <div className="space-y-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  data.verificationStatus === 'verified'
                    ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                    : 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                }
              >
                {VERIFICATION_LABELS[data.verificationStatus] ?? data.verificationStatus}
              </Badge>
              <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">
                {isAgency ? 'Recruitment agency' : 'Direct employer'}
              </Badge>
            </div>
            {data.verificationStatus !== 'verified' ? (
              <p className="text-sm text-slate-400">
                Only a Ravelyth administrator can verify a company. Until then some actions stay
                limited.
                {data.verificationNotes ? ` Note from the team: ${data.verificationNotes}` : ''}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Your account type and verification status cannot be changed from this page.
            </p>
          </div>
        </Card>
      ) : null}

      <form onSubmit={save} noValidate>
        <Card>
          <CardHeader title="Company details" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {error ? (
              <div className="sm:col-span-2">
                <Alert kind="error">{error}</Alert>
              </div>
            ) : null}
            {message ? (
              <div className="sm:col-span-2">
                <Alert kind="success">{message}</Alert>
              </div>
            ) : null}

            <Field label="Company name" htmlFor="co-name">
              <input
                id="co-name"
                className={inputClass}
                value={current.name}
                onChange={(event) => setValues({ ...current, name: event.target.value })}
              />
            </Field>
            <Field label="Website" htmlFor="co-web">
              <input
                id="co-web"
                type="url"
                className={inputClass}
                value={current.website}
                onChange={(event) => setValues({ ...current, website: event.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="Industry" htmlFor="co-industry">
              <input
                id="co-industry"
                className={inputClass}
                value={current.industry}
                onChange={(event) => setValues({ ...current, industry: event.target.value })}
              />
            </Field>
            <Field label="Company size" htmlFor="co-size">
              <input
                id="co-size"
                className={inputClass}
                value={current.companySize}
                onChange={(event) => setValues({ ...current, companySize: event.target.value })}
              />
            </Field>
            <Field label="Location" htmlFor="co-location">
              <input
                id="co-location"
                className={inputClass}
                value={current.location}
                onChange={(event) => setValues({ ...current, location: event.target.value })}
              />
            </Field>
            <Field label="Phone" htmlFor="co-phone">
              <input
                id="co-phone"
                type="tel"
                className={inputClass}
                value={current.phone}
                onChange={(event) => setValues({ ...current, phone: event.target.value })}
              />
            </Field>
            <Field label="Official email" htmlFor="co-email">
              <input
                id="co-email"
                type="email"
                className={inputClass}
                value={current.officialEmail}
                onChange={(event) => setValues({ ...current, officialEmail: event.target.value })}
              />
            </Field>
            <Field label="Authorised contact name" htmlFor="co-contact">
              <input
                id="co-contact"
                className={inputClass}
                value={current.authorizedContactName}
                onChange={(event) =>
                  setValues({ ...current, authorizedContactName: event.target.value })
                }
              />
            </Field>
            <Field label="Authorised contact phone" htmlFor="co-contact-phone">
              <input
                id="co-contact-phone"
                type="tel"
                className={inputClass}
                value={current.authorizedContactPhone}
                onChange={(event) =>
                  setValues({ ...current, authorizedContactPhone: event.target.value })
                }
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="About the company" htmlFor="co-desc">
                <textarea
                  id="co-desc"
                  rows={4}
                  className={inputClass}
                  value={current.description}
                  onChange={(event) => setValues({ ...current, description: event.target.value })}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" loading={busy}>
                Save company details
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
