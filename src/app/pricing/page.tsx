import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';
import {
  formatPlanPrice,
  isPlanPurchasable,
  managedSupportPlan,
  planCatalog,
} from '@/lib/plans/catalog';
import {
  RECRUITER_PLAN_SEED,
  formatAmountMinor,
} from '@/lib/portal/recruiter-plans/catalog';
import { recruiterFeatureLabel } from '@/lib/portal/recruiter-plans/features';
import { listRecruiterPlans, type RecruiterPlanDTO } from '@/lib/portal/recruiter-plans/service';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Ravelyth Talent pricing: recruiter plans from ₹3,999/month with monthly job-post allowances, plus Ravelyth Managed Support at ₹599/month. Free diagnostic tools for everyone.',
  alternates: { canonical: '/pricing' },
};

/**
 * The recruiter plan section renders the SAME rows checkout charges against.
 * When the database is unavailable (a static build, a deployment without one)
 * it degrades to the locked seed catalogue — which is exactly what the
 * migration inserts — rather than failing the whole page.
 */
function seedRecruiterPlans(): RecruiterPlanDTO[] {
  return RECRUITER_PLAN_SEED.map((seed) => ({
    id: seed.code,
    code: seed.code,
    name: seed.name,
    description: seed.description,
    priceMonthlyMinor: seed.priceMonthlyMinor,
    priceAnnualMinor: seed.priceAnnualMinor,
    annualListPriceMinor: null,
    jobPostsPerMonth: seed.jobPostsPerMonth,
    currency: 'INR',
    supportTier: seed.supportTier,
    isEnterprise: seed.isEnterprise,
    isActive: true,
    sortOrder: seed.sortOrder,
    features: [...seed.features],
  }));
}

async function loadRecruiterPlans(): Promise<RecruiterPlanDTO[]> {
  try {
    const plans = await listRecruiterPlans();
    if (plans.length > 0) return plans;
  } catch {
    // No database at build time: fall through to the seed catalogue.
  }
  return seedRecruiterPlans();
}

export default async function Page(): Promise<React.ReactElement> {
  const plans = planCatalog();
  const supportPlan = managedSupportPlan();
  const purchasable = isPlanPurchasable(supportPlan);
  const recruiterPlans = await loadRecruiterPlans();

  return (
    <InfoPage
      title="Pricing"
      intro="The diagnostic tools and Knowledge Base are free for everyone. Recruiter plans bundle a monthly job-post allowance with the hiring tools, and Managed Support adds a human-backed ticket queue for DNS, email, WordPress and basic VPS work."
    >
      <InfoSection title="Recruiter plans" id="recruiter-plans">
        <p className="text-muted">
          Every plan includes a fixed monthly job-post allowance, company profile, applications
          and notifications. When the allowance is spent you can buy prepaid job credits, or
          upgrade at any time. Prices exclude GST, which is shown at checkout.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {recruiterPlans.map((plan) => (
            <section
              key={plan.code}
              className={`flex flex-col rounded-xl border bg-navy-surface p-6 ${
                plan.isEnterprise ? 'border-accent' : 'border-line'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
                {plan.isEnterprise && (
                  <span className="rounded-full border border-accent px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent">
                    Enterprise
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">
                {formatAmountMinor(plan.priceMonthlyMinor, plan.currency)}
                <span className="text-sm font-normal text-slate-400">/month</span>
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {formatAmountMinor(plan.priceAnnualMinor, plan.currency)} billed yearly
              </p>
              <p className="mt-3 text-sm font-medium text-accent">
                {plan.jobPostsPerMonth} job posts included each month
              </p>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
                {plan.features.map((key) => (
                  <li key={key}>{recruiterFeatureLabel(key)}</li>
                ))}
              </ul>
              <div className="mt-5 pt-1">
                <Link
                  href="/employer/subscription"
                  className="inline-block w-full rounded-md bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-strong"
                >
                  Choose {plan.name}
                </Link>
              </div>
            </section>
          ))}
        </div>
      </InfoSection>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <section key={plan.id} className="rounded-xl border border-line bg-navy-surface p-6">
            <h2 className="text-xl font-semibold text-ink">{plan.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{plan.summary}</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">
              {formatPlanPrice(plan.price)}
            </p>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="mt-5">
              {plan.entitlement.managedSupport ? (
                purchasable ? (
                  <Link
                    href="/account/billing"
                    className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                  >
                    Subscribe
                  </Link>
                ) : (
                  <Link
                    href="/support/request"
                    className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                  >
                    Request Managed Support
                  </Link>
                )
              ) : (
                <span className="inline-block rounded-md border border-line px-4 py-2 text-sm font-medium text-slate-400">
                  Free — no account needed
                </span>
              )}
            </div>
          </section>
        ))}
      </div>

      <InfoSection title="What Managed Support does not include" id="boundaries">
        <ul className="list-disc space-y-2 pl-5">
          {supportPlan.boundaries.map((boundary) => (
            <li key={boundary}>{boundary}</li>
          ))}
        </ul>
      </InfoSection>

      <InfoSection title="Billing status" id="billing-status">
        <p>
          {purchasable ? (
            <>Online subscription and payment are available through this website.</>
          ) : (
            <>
              <span className="font-medium text-ink">Online billing is not connected yet.</span> No payment can
              currently be taken through this website, and no subscription is created or charged automatically.
              Use the{' '}
              <Link href="/support/request" className="font-medium text-accent hover:text-accent-strong">
                support request form
              </Link>{' '}
              and we will arrange Managed Support directly and transparently.
            </>
          )}
        </p>
        <p className="text-sm text-slate-400">
          When billing is enabled, subscriptions will appear in your portal with plan status, billing period and
          invoices — created only from real payment records.
        </p>
      </InfoSection>

      <InfoSection title="Links" id="links">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <Link href="/services" className="font-medium text-accent hover:text-accent-strong">
              Managed services and scope
            </Link>
          </li>
          <li>
            <Link href="/docs" className="font-medium text-accent hover:text-accent-strong">
              Knowledge Base
            </Link>
          </li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}