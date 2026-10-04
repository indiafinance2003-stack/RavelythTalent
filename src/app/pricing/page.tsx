import type { Metadata } from 'next';
import Link from 'next/link';
import { InfoPage, InfoSection } from '@/components/layout/info-page';
import {
  RECRUITER_PLAN_SEED,
  formatAmountMinor,
} from '@/lib/portal/recruiter-plans/catalog';
import { recruiterFeatureLabel } from '@/lib/portal/recruiter-plans/features';
import { listRecruiterPlans, type RecruiterPlanDTO } from '@/lib/portal/recruiter-plans/service';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Ravelyth Talent pricing: recruiter plans from ₹3,999/month with monthly job-post allowances, and candidate Premium for resume builder and profile upgrades. Browsing and applying to jobs is free.',
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
  const recruiterPlans = await loadRecruiterPlans();

  return (
    <InfoPage
      title="Pricing"
      intro="Browsing jobs, creating a candidate account and applying are free. Recruiter plans bundle a monthly job-post allowance with the hiring tools, and Candidate Premium unlocks the structured resume builder."
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

      <InfoSection title="Candidates" id="candidates">
        <p>
          Creating an account, building your profile, and applying to jobs is free for every candidate. You
          never need a plan to be considered for a role.
        </p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section className="rounded-xl border border-line bg-navy-surface p-6">
            <h2 className="text-xl font-semibold text-ink">Free</h2>
            <p className="mt-1 text-sm text-slate-400">
              Everything you need to apply and track your applications.
            </p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-ink">Free</p>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              <li>One maintained candidate profile</li>
              <li>Upload and manage resumes</li>
              <li>Apply to jobs and track every application</li>
              <li>Job alerts and email notifications</li>
              <li>Save jobs and manage your preferences</li>
            </ul>
            <div className="mt-5">
              <Link
                href="/register?type=candidate"
                className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
              >
                Create a free account
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-accent bg-navy-surface p-6">
            <h2 className="text-xl font-semibold text-ink">Candidate Premium</h2>
            <p className="mt-1 text-sm text-slate-400">
              For candidates who want the structured resume builder and a stronger presentation.
            </p>
            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              <li>Structured resume builder with editable documents</li>
              <li>Professional resume templates</li>
              <li>Multiple resume versions with history</li>
              <li>Resume PDF generation and download</li>
            </ul>
            <div className="mt-5">
              <Link
                href="/candidate/premium"
                className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
              >
                View Premium
              </Link>
            </div>
          </section>
        </div>
      </InfoSection>

      <InfoSection title="Job credits" id="credits">
        <p>
          When the monthly allowance in your recruiter plan is used up, you can buy prepaid job credits
          without waiting for a renewal. Credits are consumed as you submit postings for review.
        </p>
        <p className="mt-3">
          <Link href="/employer/credits" className="font-medium text-accent hover:text-accent-strong">
            Buy job credits
          </Link>
        </p>
      </InfoSection>

      <InfoSection title="Billing status" id="billing-status">
        <p>
          Payments are taken through this website and verified server-side. A subscription, order or
          invoice appears in your portal only after a real payment record exists — Ravelyth Talent never
          creates a placeholder or simulated invoice.
        </p>
        <p className="text-sm text-slate-400">
          Invoices show the billing entity details and GST where applicable, and are available as PDF from
          your employer portal.
        </p>
      </InfoSection>
    </InfoPage>
  );
}