'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatMoney, minorToInput, parseMoneyToMinor } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { AdminJobPackageRow } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/** Field edits staged for one package, keyed by field name. */
type Draft = Record<string, string>;

/**
 * The job credit package catalogue.
 *
 * Prices are typed in major units because that is what an admin thinks in, then
 * converted with the shared `parseMoneyToMinor` helper before the request goes
 * out. The server row stays authoritative either way: the amount an employer is
 * charged is always read from the package, never from this form, so a mistyped
 * price can misprice a sale but can never let a buyer choose what they pay.
 *
 * Deactivating is preferred over deleting, because existing orders and credit
 * ledger entries still reference a package that is no longer on sale.
 */
export function AdminPackages(): React.ReactElement {
  const [showInactive, setShowInactive] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const catalogue = useAsync(
    () =>
      portalGet<{ packages: AdminJobPackageRow[] }>(
        `/api/portal/admin/packages${showInactive ? '?includeInactive=1' : ''}`
      ),
    [showInactive]
  );

  const items = catalogue.data?.packages ?? [];

  function setField(id: string, key: string, value: string): void {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [key]: value } }));
  }

  async function save(pkg: AdminJobPackageRow): Promise<void> {
    setError(null);
    setMessage(null);

    const draft = drafts[pkg.id] ?? {};
    const payload: Record<string, unknown> = { packageId: pkg.id };

    if (draft.price !== undefined) {
      const minor = parseMoneyToMinor(draft.price);
      if (minor === null) {
        setError(`"${draft.price}" is not a valid amount.`);
        return;
      }
      payload.priceMinor = minor;
    }
    if (draft.name !== undefined && draft.name.trim().length > 0) {
      payload.name = draft.name.trim();
    }
    for (const key of ['credits', 'validityDays'] as const) {
      if (draft[key] === undefined) continue;
      const value = Number.parseInt(draft[key], 10);
      if (!Number.isInteger(value) || value < 1) {
        setError(`${key === 'credits' ? 'Credits' : 'Validity'} must be a whole number of at least 1.`);
        return;
      }
      payload[key] = value;
    }

    if (Object.keys(payload).length === 1) {
      setError(`Nothing was changed on ${pkg.name}.`);
      return;
    }

    setBusyId(pkg.id);
    try {
      await portalSend('PUT', '/api/portal/admin/packages', payload);
      await catalogue.reload();
      setMessage(`${pkg.name} updated.`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[pkg.id];
        return next;
      });
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStatus(pkg: AdminJobPackageRow): Promise<void> {
    setError(null);
    setMessage(null);
    const next = pkg.status === 'active' ? 'inactive' : 'active';
    if (
      next === 'inactive' &&
      !window.confirm(
        `Deactivate "${pkg.name}"? Employers will stop being able to buy it. Credits already granted are unaffected.`
      )
    ) {
      return;
    }

    setBusyId(pkg.id);
    try {
      await portalSend('PUT', '/api/portal/admin/packages', { packageId: pkg.id, status: next });
      await catalogue.reload();
      setMessage(`${pkg.name} is now ${next}.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Job packages"
        description="The credit packages employers can buy. Prices are stored server-side and are what employers are charged."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show packages that are not on sale
          </label>
          <p className="text-sm text-slate-500">{items.length} package(s)</p>
        </div>
      </Card>

      {catalogue.loading ? <LoadingState label="Loading packages…" /> : null}
      {catalogue.error ? <ErrorState message={catalogue.error} onRetry={catalogue.reload} /> : null}

      {items.length === 0 && !catalogue.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState title="No packages configured" />
          </div>
        </Card>
      ) : null}

      {items.map((pkg) => {
        const draft = drafts[pkg.id] ?? {};
        return (
          <Card key={pkg.id}>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{pkg.name}</h3>
                  <p className="text-xs text-slate-500">
                    Code <span className="text-slate-400">{pkg.code}</span> · {pkg.credits} credit(s)
                    valid for {pkg.validityDays} days
                  </p>
                  {pkg.description ? (
                    <p className="mt-1 max-w-2xl text-sm text-slate-400">{pkg.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-lg font-semibold text-ink">
                    {formatMoney(pkg.priceMinor, pkg.currency)}
                  </p>
                  <Badge
                    tone={
                      pkg.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 ring-slate-700'
                    }
                  >
                    {pkg.status === 'active' ? 'On sale' : 'Not on sale'}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Name" htmlFor={`pkg-name-${pkg.id}`}>
                  <input
                    id={`pkg-name-${pkg.id}`}
                    className={inputClass}
                    value={draft.name ?? pkg.name}
                    onChange={(event) => setField(pkg.id, 'name', event.target.value)}
                  />
                </Field>
                <Field label={`Price (${pkg.currency})`} htmlFor={`pkg-price-${pkg.id}`}>
                  <input
                    id={`pkg-price-${pkg.id}`}
                    className={inputClass}
                    inputMode="decimal"
                    value={draft.price ?? minorToInput(pkg.priceMinor)}
                    onChange={(event) => setField(pkg.id, 'price', event.target.value)}
                  />
                </Field>
                <Field label="Credits" htmlFor={`pkg-credits-${pkg.id}`}>
                  <input
                    id={`pkg-credits-${pkg.id}`}
                    className={inputClass}
                    inputMode="numeric"
                    value={draft.credits ?? String(pkg.credits)}
                    onChange={(event) => setField(pkg.id, 'credits', event.target.value)}
                  />
                </Field>
                <Field label="Valid for (days)" htmlFor={`pkg-days-${pkg.id}`}>
                  <input
                    id={`pkg-days-${pkg.id}`}
                    className={inputClass}
                    inputMode="numeric"
                    value={draft.validityDays ?? String(pkg.validityDays)}
                    onChange={(event) => setField(pkg.id, 'validityDays', event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" loading={busyId === pkg.id} onClick={() => save(pkg)}>
                  Save changes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busyId === pkg.id}
                  onClick={() => toggleStatus(pkg)}
                >
                  {pkg.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

