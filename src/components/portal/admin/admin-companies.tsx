'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatDate, VERIFICATION_LABELS } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminCompanyRow } from '@/lib/portal-client/types';
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

/**
 * The company moderation queue.
 *
 * Verification is the single most consequential action in this console: a
 * verified company is trusted on its job postings, so it is never automatic and
 * never employer-granted. This screen is the only place it can happen.
 *
 * Reclassification (employer <-> agency) is equally deliberate, and its
 * consequences are spelled out in the confirmation dialog rather than buried in
 * a tooltip, because demoting an agency revokes its client authorisations in the
 * same operation.
 */
export function AdminCompanies(): React.ReactElement {
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const companies = useAsync(
    () =>
      portalGet<{ items: AdminCompanyRow[] }>(
        `/api/portal/admin/companies?limit=50${status ? `&status=${status}` : ''}`
      ),
    [status]
  );

  async function verify(company: AdminCompanyRow, next: string): Promise<void> {
    setError(null);
    setMessage(null);

    let notes: string | null = null;
    if (next !== 'verified') {
      // A rejection or suspension must carry a reason: the company sees this
      // note and has to be able to act on it.
      const entered = window.prompt(
        `Why are you marking "${company.name}" as ${VERIFICATION_LABELS[next] ?? next}? The company sees this note.`
      );
      if (entered === null) return;
      if (entered.trim().length === 0) {
        setError('A reason is required to reject or suspend a company.');
        return;
      }
      notes = entered.trim();
    } else {
      const ok = window.confirm(
        `Verify "${company.name}"? Its job postings will be treated as trusted from now on. This is audited.`
      );
      if (!ok) return;
    }

    setBusyId(company.id);
    try {
      await portalSend('PUT', `/api/portal/admin/companies/${company.id}`, { status: next, notes });
      await companies.reload();
      setMessage(
        next === 'verified'
          ? `"${company.name}" is now verified.`
          : `"${company.name}" marked as ${VERIFICATION_LABELS[next] ?? next}.`
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function reclassify(company: AdminCompanyRow, next: string): Promise<void> {
    setError(null);
    setMessage(null);

    const warning =
      next === 'employer'
        ? `"${company.name}" will stop being a recruitment agency, and every client company it was authorised to post for will be revoked immediately.`
        : `"${company.name}" will become a recruitment agency, which lets it publish vacancies attributed to client companies you authorise.`;

    if (!window.confirm(`${warning}\n\nContinue?`)) return;

    setBusyId(company.id);
    try {
      await portalSend('PATCH', `/api/portal/admin/companies/${company.id}`, {
        companyType: next,
      });
      await companies.reload();
      setMessage(
        `"${company.name}" is now ${
          next === 'recruitment_agency' ? 'a recruitment agency' : 'a direct employer'
        }.`
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  const items = companies.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Companies and agencies"
        description="Verification is manual and audited. Only a decision made here can grant a company trust."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-[12rem] flex-1">
            <label className={labelClass} htmlFor="ac-status">
              Verification status
            </label>
            <select
              id="ac-status"
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All companies</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <p className="text-sm text-slate-500">{items.length} shown</p>
        </div>
      </Card>

      {companies.loading ? <LoadingState label="Loading companies…" /> : null}
      {companies.error ? <ErrorState message={companies.error} onRetry={companies.reload} /> : null}

      {items.length === 0 && !companies.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState title="No companies match this filter" />
          </div>
        </Card>
      ) : null}

      {items.map((company) => (
        <Card key={company.id}>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{company.name}</h3>
                <p className="text-xs text-slate-500">
                  {[company.industry, company.companySize, company.location].filter(Boolean).join(' · ') ||
                    'No details yet'}
                </p>
                {company.officialEmail ? (
                  <p className="text-xs text-slate-500">{company.officialEmail}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  tone={
                    company.verificationStatus === 'verified'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : company.verificationStatus === 'pending'
                        ? 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                        : 'bg-red-500/10 text-red-300 ring-red-500/40'
                  }
                >
                  {VERIFICATION_LABELS[company.verificationStatus] ?? company.verificationStatus}
                </Badge>
                <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">
                  {company.companyType === 'recruitment_agency' ? 'Recruitment agency' : 'Direct employer'}
                </Badge>
              </div>
            </div>

            {company.verificationNotes ? (
              <p className="rounded-md bg-paper/60 px-3 py-2 text-xs text-slate-400">
                Note: {company.verificationNotes}
              </p>
            ) : null}
            <p className="text-xs text-slate-600">Registered {formatDate(company.createdAt)}</p>

            <div className="flex flex-wrap gap-2">
              {company.verificationStatus === 'verified' ? (
                <Button
                  variant="danger"
                  size="sm"
                  loading={busyId === company.id}
                  onClick={() => verify(company, 'suspended')}
                >
                  Suspend company
                </Button>
              ) : (
                <Button size="sm" loading={busyId === company.id} onClick={() => verify(company, 'verified')}>
                  Verify
                </Button>
              )}
              {company.verificationStatus !== 'rejected' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busyId === company.id}
                  onClick={() => verify(company, 'rejected')}
                >
                  Reject
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                loading={busyId === company.id}
                onClick={() =>
                  reclassify(
                    company,
                    company.companyType === 'recruitment_agency' ? 'employer' : 'recruitment_agency'
                  )
                }
              >
                {company.companyType === 'recruitment_agency'
                  ? 'Reclassify as direct employer'
                  : 'Reclassify as agency'}
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

