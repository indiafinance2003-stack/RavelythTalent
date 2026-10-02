'use client';

import { useState } from 'react';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { formatMoney, minorToInput, parseMoneyToMinor } from '@/lib/portal-client/format';
import { useAsync } from '@/lib/portal-client/use-async';
import type { PremiumPlanRow } from '@/lib/portal-client/types';
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

/**
 * The candidate premium plan catalogue.
 *
 * A plan can be repriced or withdrawn here, but nothing on this screen can GRANT
 * premium. Entitlement follows a verified payment, so an edit here changes what a
 * future purchase would buy — not what anyone currently holds. That keeps a
 * pricing mistake from silently handing out paid features, and it keeps the only
 * way to activate premium the same as it is for a candidate: actually paying.
 */
export function AdminPremiumPlans(): React.ReactElement {
  const plans = useAsync(() => portalGet<{ items: PremiumPlanRow[] }>('/api/portal/admin/premium-plans'), []);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const items = plans.data?.items ?? [];

  function setField(id: string, value: string): void {
    setDrafts((current) => ({ ...current, [id]: value }));
  }

  async function save(plan: PremiumPlanRow): Promise<void> {
    setError(null);
    setMessage(null);

    const raw = drafts[plan.id];
    if (raw === undefined) {
      setError(`Nothing was changed on ${plan.name}.`);
      return;
    }
    const minor = parseMoneyToMinor(raw);
    if (minor === null) {
      setError(`"${raw}" is not a valid amount.`);
      return;
    }

    setBusyId(plan.id);
    try {
      await portalSend('PATCH', `/api/portal/admin/premium-plans/${plan.id}`, { priceMinor: minor });
      await plans.reload();
      setMessage(`${plan.name} is now ${formatMoney(minor, plan.currency)}.`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[plan.id];
        return next;
      });
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(plan: PremiumPlanRow): Promise<void> {
    setError(null);
    setMessage(null);
    const next = !plan.isActive;
    if (
      !next &&
      !window.confirm(
        `Withdraw "${plan.name}"? Candidates will no longer be able to buy it. Anyone who already subscribed keeps their premium until it expires.`
      )
    ) {
      return;
    }

    setBusyId(plan.id);
    try {
      await portalSend('PATCH', `/api/portal/admin/premium-plans/${plan.id}`, { isActive: next });
      await plans.reload();
      setMessage(`${plan.name} is now ${next ? 'on sale' : 'withdrawn'}.`);
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
        title="Premium plans"
        description="What candidates can buy. Premium itself is only ever granted by a verified payment, never from this screen."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {plans.loading ? <LoadingState label="Loading premium plans…" /> : null}
      {plans.error ? <ErrorState message={plans.error} onRetry={plans.reload} /> : null}

      {items.length === 0 && !plans.loading ? (
        <Card>
          <div className="p-5">
            <EmptyState title="No premium plans configured" />
          </div>
        </Card>
      ) : null}

      {items.map((plan) => (
        <Card key={plan.id}>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{plan.name}</h3>
                <p className="text-xs text-slate-500">
                  Code <span className="text-slate-400">{plan.code}</span> · {plan.billingPeriod} ·{' '}
                  {plan.durationDays} days
                </p>
                {plan.description ? (
                  <p className="mt-1 max-w-2xl text-sm text-slate-400">{plan.description}</p>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-lg font-semibold text-ink">
                  {formatMoney(plan.priceMinor, plan.currency)}
                </p>
                <Badge
                  tone={
                    plan.isActive
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 ring-slate-700'
                  }
                >
                  {plan.isActive ? 'On sale' : 'Withdrawn'}
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Price (${plan.currency})`} htmlFor={`pp-price-${plan.id}`}>
                <input
                  id={`pp-price-${plan.id}`}
                  className={inputClass}
                  inputMode="decimal"
                  value={drafts[plan.id] ?? minorToInput(plan.priceMinor)}
                  onChange={(event) => setField(plan.id, event.target.value)}
                />
              </Field>
              <div className="flex items-end gap-2">
                <Button size="sm" loading={busyId === plan.id} onClick={() => save(plan)}>
                  Save price
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busyId === plan.id}
                  onClick={() => toggle(plan)}
                >
                  {plan.isActive ? 'Withdraw' : 'Restore'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

