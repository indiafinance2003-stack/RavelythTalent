import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUserCompanies } from "@/lib/entitlements";
import { listPublicPlans } from "@/lib/billing/plans";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { DecorCircles } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent plans for job seekers and employers. Compare monthly and annual pricing for Ravelyth Talent.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const [plans, user] = await Promise.all([listPublicPlans(), getCurrentUser()]);
  const companies = user ? await listUserCompanies(user.id) : [];

  return (
    <div className="relative">
      <DecorCircles />

      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-extrabold text-navy sm:text-4xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-3 text-slate-600">
            Job seekers start free. Employers pay for the job posts and hiring
            tools they actually use. Prices in INR, billed monthly or yearly.
          </p>
        </div>

        <div className="mt-10">
          <PricingPlans
            plans={plans}
            signedIn={Boolean(user)}
            companyId={companies.at(0)?.id ?? null}
          />
        </div>

        <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-sky-tint bg-white p-6 text-sm text-slate-600">
          <h2 className="text-base font-bold text-navy">
            How upgrades and downgrades work
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              A new plan starts immediately and the previous one ends at that
              moment.
            </li>
            <li>
              The unused remainder of a cancelled period is not refunded and not
              prorated - see ASSUMPTIONS.md for the full policy.
            </li>
            <li>
              Subscriptions are period based: a successful payment activates the
              plan for one month or one year. We email you before expiry.
            </li>
            <li>
              Every payment produces a downloadable tax invoice in your billing
              history.
            </li>
          </ul>
          <p className="mt-4">
            Questions? <Link href="/faq" className="font-semibold text-royal hover:underline">Read the FAQ</Link>{" "}
            or <Link href="/contact" className="font-semibold text-royal hover:underline">contact us</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
