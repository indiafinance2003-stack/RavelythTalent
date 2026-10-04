'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalGet, portalPost, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { useSession } from '@/lib/portal-client/use-session';
import { usePortalCheckout } from '@/components/portal/checkout/use-portal-checkout';
import {
  CheckoutStatus,
  portalLabels,
  toStartedCheckout,
} from '@/components/portal/checkout/checkout-status';
import type {
  BillingPeriod,
  CompanyPlanOverview,
  RecruiterPlanDTO,
} from '@/lib/portal-client/types';
import { formatDate, formatMoney } from '@/lib/portal-client/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Meter,
  PageHeader,
} from '@/components/portal/ui';

/**
 * The company's recruiter plan: what it is, what it has left, and how to change it.
 *
 * THREE THINGS THIS SCREEN DELIBERATELY DOES NOT DO:
 *
 * 1. It never decides whether the company may post. `overview.canPost` is the
 *    server's own answer, computed by the same code that enforces the limit at
 *    submission time. Re-deriving it here would let the dashboard say "you can
 *    post" while the API refuses.
 * 2. It never sets a price. Checkout sends a plan id and a billing period, and
 *    the amount the provider window opens with is the one the server quoted. A
 *    tampered request cannot change what is charged, and this screen has no price
 *    field to tamper with.
 * 3. It never claims a payment happened. The subscription changes only after the
 *    gateway's signature is verified server-side, and the status shown is the
 *    server's confirmation rather than the provider's success callback.
 */
export function SubscriptionPage(): React.ReactElement {
  const { user } = useSession();
  const checkout = usePortalCheckout();

  const overview = useAsync(
    () => portalGet<CompanyPlanOverview>('/api/portal/employer/subscription'),
    []
  );
  const catalogue = useAsync(() => portalGet<{ items: RecruiterPlanDTO[] }>('/api/portal/plans'), []);

  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const data = overview.data ?? null;
  const plan = data?.plan ?? null;
  const usage = data?.usage ?? null;
  const subscription = data?.subscription ?? null;
  const events = data?.events ?? [];
  const plans = catalogue.data?.items ?? [];

  /** Opens checkout for a plan. The request body carries NO amount. */
  async function subscribe(target: RecruiterPlanDTO, billingPeriod: BillingPeriod): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(target.code);
    try {
      await checkout.pay(
        () =>
          portalPost<{
            order: { orderNumber: string; amountMinor: number; currency: string };
            providerOrderId: string;
            providerKeyId: string | null;
          }>('/api/portal/employer/subscription/checkout', {
            planId: target.id,
            billingPeriod,
            nonRefundableAccepted: true,
          }).then(toStartedCheckout),
        portalLabels(`Ravelyth Talent plan: ${target.name}`, {
          name: user?.name ?? '',
          email: user?.email ?? '',
        })
      );
      // Re-read rather than assume: only the server knows whether the
      // subscription actually changed.
      await overview.reload();
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function changeCancellation(action: 'cancel_at_period_end' | 'resume'): Promise<void> {
    setError(null);
    setMessage(null);
    setBusy(action);
    try {
      await portalSend('PATCH', '/api/portal/employer/subscription', { action });
      await overview.reload();
      setMessage(
        action === 'cancel_at_period_end'
          ? 'Cancellation requested. Your access continues until the end of the paid period.'
          : 'Cancellation withdrawn. Your plan will renew as normal.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  if (overview.loading) return <LoadingState label="Loading your subscription…" />;
  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Subscription"
        title={plan ? plan.name : 'No active plan'}
        description="Your plan decides how many jobs you can post each billing period and which hiring tools you can use."
        action={
          <Link href="/pricing" className="text-sm text-accent-soft">
            Compare all plans
          </Link>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}
      <CheckoutStatus
        checkout={checkout}
        orderNumber={checkout.current?.orderNumber}
        onRetry={checkout.reset}
      />

      {subscription ? (
        <CurrentPlanCard
          subscription={subscription}
          planName={plan?.name ?? subscription.planName}
          busy={busy}
          onCancelChange={changeCancellation}
        />
      ) : null}

      <UsageCard
        usage={usage}
        creditsAvailable={data?.creditsAvailable ?? 0}
        canPost={data?.canPost ?? false}
      />

      {plan && data?.features.length ? <FeaturesCard features={data.features} /> : null}

      <PlanChooser
        plans={plans}
        loading={catalogue.loading}
        error={catalogue.error}
        onRetry={catalogue.reload}
        period={period}
        onPeriodChange={setPeriod}
        currentPlanId={plan?.id ?? null}
        currentPeriod={subscription?.billingPeriod ?? null}
        busy={busy}
        checkoutBusy={checkout.phase === 'awaiting' || checkout.phase === 'starting'}
        onChoose={subscribe}
      />

      <SubscriptionHistoryCard events={events} currency={subscription?.currency ?? 'INR'} />
    </div>
  );
}

/** The plan in force, its billing dates, and the cancel/resume decision. */
function CurrentPlanCard({
  subscription,
  planName,
  busy,
  onCancelChange,
}: {
  subscription: NonNullable<CompanyPlanOverview['subscription']>;
  planName: string;
  busy: string | null;
  onCancelChange: (action: 'cancel_at_period_end' | 'resume') => Promise<void>;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Current plan"
        description={`${planName} · billed ${subscription.billingPeriod}`}
        action={
          <Badge
            tone={
              subscription.status === 'active'
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/40'
                : subscription.status === 'expiring'
                  ? 'bg-amber-500/10 text-amber-300 ring-amber-500/40'
                  : 'bg-slate-800 text-slate-400 ring-slate-700'
            }
          >
            {subscription.cancelAtPeriodEnd
              ? 'Cancels at period end'
              : subscription.status.replace(/_/g, ' ')}
          </Badge>
        }
      />
      <dl className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Paid</dt>
          <dd className="mt-1 text-sm text-slate-300">
            {formatMoney(subscription.amountMinor, subscription.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Current period ends</dt>
          <dd className="mt-1 text-sm text-slate-300">{formatDate(subscription.currentPeriodEnd)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Started</dt>
          <dd className="mt-1 text-sm text-slate-300">{formatDate(subscription.startedAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line p-5">
        {subscription.cancelAtPeriodEnd ? (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'resume'}
            onClick={() => void onCancelChange('resume')}
          >
            Keep my plan and renew
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            loading={busy === 'cancel_at_period_end'}
            onClick={() => void onCancelChange('cancel_at_period_end')}
          >
            Cancel at period end
          </Button>
        )}
        <Link href="/employer/invoices" className="text-sm text-accent-soft">
          View invoices
        </Link>
      </div>
    </Card>
  );
}
/**
 * The allowance meter.
 *
 * The "can I post" banner is driven by the server's `canPost` rather than by
 * arithmetic done here, so this screen can never disagree with the enforcement
 * layer about whether a posting will be accepted.
 */
function UsageCard({
  usage,
  creditsAvailable,
  canPost,
}: {
  usage: CompanyPlanOverview['usage'];
  creditsAvailable: number;
  canPost: boolean;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Job posts this period"
        description={
          usage
            ? `${usage.used} of ${usage.allowance} used. Prepaid credits are spent once the allowance is exhausted.`
            : undefined
        }
      />
      <div className="space-y-3 p-5">
        {usage ? (
          <>
            <Meter
              value={usage.used}
              max={Math.max(usage.allowance, 1)}
              label="Job posts used this period"
              tone={
                usage.level === 'exhausted'
                  ? 'bg-red-500'
                  : usage.level === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-400">{usage.remaining} allowance remaining</span>
              <span className="text-slate-500">
                {creditsAvailable} prepaid credit{creditsAvailable === 1 ? '' : 's'} available
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            A monthly job-post allowance comes with every plan. Choose one below to start posting.
          </p>
        )}
      </div>
      {!canPost ? (
        <div className="border-t border-line p-5">
          <Alert kind="warning">
            You cannot post another job right now. Upgrade your plan, or buy prepaid job credits
            from the <Link href="/employer/packages">packages page</Link>.
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}

/** The capabilities the current plan grants, read from the plan itself. */
function FeaturesCard({ features }: { features: string[] }): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="What your plan includes"
        description="These capabilities are granted by the plan row in the database, not by this browser."
      />
      <ul className="grid gap-2 p-5 sm:grid-cols-2">
        {features.map((feature) => (
          <li key={feature} className="text-sm text-slate-300">
            {feature.replace(/_/g, ' ')}
          </li>
        ))}
      </ul>
    </Card>
  );
}
/** The public catalogue, with a monthly/annual switch. */
function PlanChooser({
  plans,
  loading,
  error,
  onRetry,
  period,
  onPeriodChange,
  currentPlanId,
  currentPeriod,
  busy,
  checkoutBusy,
  onChoose,
}: {
  plans: RecruiterPlanDTO[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  period: BillingPeriod;
  onPeriodChange: (period: BillingPeriod) => void;
  currentPlanId: string | null;
  currentPeriod: string | null;
  busy: string | null;
  checkoutBusy: boolean;
  onChoose: (plan: RecruiterPlanDTO, period: BillingPeriod) => Promise<void>;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Change your plan"
        description="Prices exclude GST, which is added at checkout. Your new plan starts once the payment is confirmed."
        action={
          <div className="flex gap-1">
            {(['monthly', 'annual'] as const).map((option) => (
              <Button
                key={option}
                variant={period === option ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => onPeriodChange(option)}
              >
                {option === 'monthly' ? 'Monthly' : 'Annual'}
              </Button>
            ))}
          </div>
        }
      />
      <div className="p-5">
        {loading ? <LoadingState label="Loading plans…" /> : null}
        {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
        {!loading && !error && plans.length === 0 ? (
          <EmptyState
            title="No plans are on sale right now"
            description="Contact support and we will set something up for you."
          />
        ) : null}
        {plans.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((option) => (
              <PlanTile
                key={option.id}
                option={option}
                period={period}
                isCurrent={option.id === currentPlanId && period === currentPeriod}
                busy={busy === option.code}
                disabled={checkoutBusy}
                onChoose={onChoose}
              />
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-xs text-slate-500">
          A plan is only activated once a payment is confirmed by our payment provider. Until then
          your current access does not change. See the{' '}
          <Link href="/legal/cancellation" className="underline">
            cancellation terms
          </Link>
          .
        </p>
      </div>
    </Card>
  );
}

/** One plan card. The price shown is the catalogue's, never a typed-in value. */
function PlanTile({
  option,
  period,
  isCurrent,
  busy,
  disabled,
  onChoose,
}: {
  option: RecruiterPlanDTO;
  period: BillingPeriod;
  isCurrent: boolean;
  busy: boolean;
  disabled: boolean;
  onChoose: (plan: RecruiterPlanDTO, period: BillingPeriod) => Promise<void>;
}): React.ReactElement {
  const price = period === 'monthly' ? option.priceMonthlyMinor : option.priceAnnualMinor;
  return (
    <section
      className={`flex flex-col rounded-xl border p-4 ${
        isCurrent ? 'border-accent bg-accent-tint' : 'border-line bg-paper'
      }`}
    >
      <h3 className="text-base font-semibold text-ink">{option.name}</h3>
      <p className="mt-1 text-sm text-slate-400">
        {option.jobPostsPerMonth} job post{option.jobPostsPerMonth === 1 ? '' : 's'} per month
      </p>
      <p className="mt-3 text-2xl font-semibold text-ink">
        {formatMoney(price, option.currency)}
        <span className="text-sm font-normal text-slate-500">
          /{period === 'monthly' ? 'month' : 'year'}
        </span>
      </p>
      <div className="mt-4">
        <Button
          className="w-full"
          variant={isCurrent ? 'secondary' : 'primary'}
          disabled={isCurrent || disabled}
          loading={busy}
          onClick={() => void onChoose(option, period)}
        >
          {isCurrent ? 'Your current plan' : `Choose ${option.name}`}
        </Button>
      </div>
    </section>
  );
}

/** The append-only lifecycle log the server keeps for this subscription. */
function SubscriptionHistoryCard({
  events,
  currency,
}: {
  events: NonNullable<CompanyPlanOverview['events']>;
  currency: string;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Subscription history"
        description="Every plan change, renewal and cancellation, in the order they happened."
      />
      <div className="p-5">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No subscription activity recorded yet.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="text-sm text-slate-300">
                    {event.eventType.replace(/_/g, ' ')}
                    {event.amountMinor ? ` · ${formatMoney(event.amountMinor, currency)}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                  {event.notes ? <p className="mt-1 text-sm text-slate-400">{event.notes}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}