'use client';

import { useState } from 'react';
import Link from 'next/link';
import { portalGet, portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type { CandidateSubscription, PremiumPlan } from '@/lib/portal-client/types';
import { CONSENT_LABELS, formatDate, formatMoney, titleCase } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from '@/components/portal/ui';

/**
 * Candidate Premium.
 *
 * Premium is NOT a boolean the browser can flip. Buying starts a real order at
 * the server-side plan price and returns a gateway order to pay against; the
 * subscription only appears once a verified payment confirms it. That is why
 * this page has no "activate" button at all.
 *
 * Plans and prices come from the database, so nothing here hard-codes what
 * premium costs.
 */
export function CandidatePremium(): React.ReactElement {
  const premium = useAsync(
    () =>
      portalGet<{
        plans: PremiumPlan[];
        subscription: CandidateSubscription | null;
        entitlements: Array<{ code: string; name: string; description: string | null; expiresAt: string | null }>;
      }>('/api/portal/candidate/premium'),
    []
  );

  const [buying, setBuying] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pay, setPay] = useState<{
    orderNumber: string;
    amountMinor: number;
    providerOrderId: string;
    providerKeyId: string | null;
  } | null>(null);

  async function buy(plan: PremiumPlan): Promise<void> {
    setError(null);
    setMessage(null);
    setBuying(plan.id);
    try {
      const result = await portalPost<{
        order: { orderNumber: string; amountMinor: number };
        providerOrderId: string;
        providerKeyId: string | null;
      }>('/api/portal/candidate/premium/checkout', { planId: plan.id });

      setPay({
        orderNumber: result.order.orderNumber,
        amountMinor: result.order.amountMinor,
        providerOrderId: result.providerOrderId,
        providerKeyId: result.providerKeyId,
      });
      await premium.reload();
    } catch (caught) {
      // A 503 here means payments are not configured; report it honestly rather
      // than pretending a purchase started.
      setError(formatApiError(caught));
    } finally {
      setBuying(null);
    }
  }

  async function cancel(): Promise<void> {
    if (!window.confirm('Cancel your premium subscription at the end of the current period?')) {
      return;
    }
    setError(null);
    setMessage(null);
    setCancelling(true);
    try {
      await portalPost('/api/portal/candidate/premium', {});
      await premium.reload();
      setMessage('Your subscription is set to end at the close of the current period.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setCancelling(false);
    }
  }

  if (premium.loading) return <LoadingState label="Loading premium plans…" />;
  if (premium.error) return <ErrorState message={premium.error} onRetry={premium.reload} />;

  const plans = premium.data?.plans ?? [];
  const subscription = premium.data?.subscription ?? null;
  const entitlements = premium.data?.entitlements ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate Premium"
        title="Premium"
        description="Put your profile in front of the employers actively looking for your skills."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {pay ? (
        <Alert kind="info">
          <p>
            Order <strong>{pay.orderNumber}</strong> was created for{' '}
            {formatMoney(pay.amountMinor)}. Complete the payment in the checkout window to activate
            premium.
          </p>
          <p className="mt-2 text-xs">
            Gateway order reference: <code>{pay.providerOrderId}</code>. Payment is confirmed by the
            gateway&apos;s signed webhook; this page cannot mark an order paid.
          </p>
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Your subscription" />
        <div className="p-5">
          {subscription ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">{subscription.planName}</p>
                <Badge
                  tone={
                    subscription.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 ring-slate-700'
                  }
                >
                  {titleCase(subscription.status)}
                </Badge>
                {subscription.cancelAtPeriodEnd ? (
                  <Badge tone="bg-amber-500/10 text-amber-300 ring-amber-500/40">
                    Ends at period close
                  </Badge>
                ) : null}
              </div>
              {subscription.currentPeriodEnd ? (
                <p className="text-xs text-slate-400">
                  Current period ends {formatDate(subscription.currentPeriodEnd)}.
                </p>
              ) : null}

              {entitlements.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Active entitlements
                  </p>
                  <ul className="mt-2 space-y-1">
                    {entitlements.map((entitlement) => (
                      <li key={entitlement.code} className="text-sm text-slate-300">
                        <span className="font-medium">{entitlement.name}</span>
                        {entitlement.description ? (
                          <span className="text-slate-500"> — {entitlement.description}</span>
                        ) : null}
                        {entitlement.expiresAt ? (
                          <span className="text-xs text-slate-500">
                            {' '}
                            · expires {formatDate(entitlement.expiresAt)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!subscription.cancelAtPeriodEnd ? (
                <Button variant="secondary" onClick={cancel} loading={cancelling}>
                  Cancel subscription
                </Button>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="You are not subscribed to Premium"
              description="Choose a plan below. Premium is activated only once a payment is verified."
            />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Available plans" description="Prices are set by Ravelyth and read from the server." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.length === 0 ? (
            <p className="text-sm text-slate-400">No premium plans are available right now.</p>
          ) : null}
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-line bg-paper p-5">
              <h3 className="text-base font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 text-2xl font-semibold text-accent-soft">
                {formatMoney(plan.priceMinor, plan.currency)}
                <span className="ml-1 text-xs font-normal text-slate-500">
                  / {plan.billingPeriod === 'monthly' ? 'month' : plan.billingPeriod === 'yearly' ? 'year' : 'quarter'}
                </span>
              </p>
              {plan.description ? (
                <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                Runs for {plan.durationDays} days after purchase.
              </p>
              {plan.entitlements.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {plan.entitlements.map((entitlement) => (
                    <li key={entitlement.code} className="text-xs text-slate-400">
                      · {entitlement.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                onClick={() => buy(plan)}
                loading={buying === plan.id}
                className="mt-4 w-full"
              >
                {subscription ? 'Switch to this plan' : 'Buy this plan'}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="How premium is activated" />
        <div className="space-y-2 p-5 text-sm text-slate-400">
          <p>
            Buying creates an order at the plan price and a matching order at the payment gateway. Your
            subscription is created only when the gateway confirms the payment through a signed
            webhook.
          </p>
          <p>
            There is deliberately no &quot;activate premium&quot; action in this interface, because a
            browser cannot be trusted to grant itself entitlements.
          </p>
          <p>
            Premium is separate from job applications: applying never requires it.{' '}
            <Link href="/candidate/applications" className="text-accent-soft underline">
              View your applications
            </Link>
            .
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Consent" />
        <div className="p-5">
          <p className="text-sm text-slate-400">
            Premium is a separate product. It does not change the purposes for which your data is
            processed — those are listed under{' '}
            <Link href="/candidate/settings" className="text-accent-soft underline">
              Settings
            </Link>{' '}
            and each can be withdrawn separately
            {Object.keys(CONSENT_LABELS).length > 0 ? '.' : ''}
          </p>
        </div>
      </Card>
    </div>
  );
}
