"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { formatPaise } from "@/lib/utils";
import { openRazorpayCheckout } from "./razorpay-checkout";
import {
  Alert,
  Badge,
  Card,
} from "@/components/ui/primitives";
import type { PublicPlan } from "@/lib/billing/plans";

export type PlanPrice = {
  monthlyPaise: number;
  yearlyPaise: number;
  savingsPercent: number;
  promotionPricePaise: number | null;
};

export function PricingPlans({
  plans,
  signedIn,
  companyId,
  paymentAvailable,
}: {
  plans: PublicPlan[];
  signedIn: boolean;
  companyId: string | null;
  paymentAvailable: boolean;
}) {
  const router = useRouter();
  const [audience, setAudience] = useState<"candidate" | "employer">("candidate");
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => plans.filter((p) => p.audience === audience),
    [plans, audience],
  );

  async function startCheckout(plan: PublicPlan) {
    setError(null);

    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    if (audience === "employer" && !companyId) {
      setError(
        "Add a company to your recruiter account before choosing an employer plan.",
      );
      return;
    }

    setBusy(plan.code);
    try {
      const response = await fetch("/api/billing/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planCode: plan.code,
          billingPeriod: period,
          companyId,
          ...(plan.promotion?.billingPeriod === period
            ? { promotionCode: plan.promotion.code }
            : {}),
        }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        data?: {
          keyId: string | number | null;
          orderId: string | number | null;
          amount: string | number | null;
          currency: string | number | null;
          planCode: string;
          planName: string;
          billingPeriod: "monthly" | "yearly";
          companyId: string | null;
        };
        error?: { message?: string };
      };

      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "Could not start the payment.");
        return;
      }

      await openRazorpayCheckout(
        json.data,
        () => {
          router.push(
            audience === "employer" ? "/recruiter/billing" : "/dashboard/billing",
          );
          router.refresh();
        },
        setError,
      );
    } catch {
      setError("Could not start the payment. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div
          role="tablist"
          aria-label="Audience"
          className="inline-flex rounded-xl border border-slate-300 bg-white p-1"
        >
          {(["candidate", "employer"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={audience === key}
              onClick={() => setAudience(key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                audience === key ? "bg-royal text-white" : "text-navy"
              }`}
            >
              {key === "candidate" ? "For job seekers" : "For employers"}
            </button>
          ))}
        </div>

        {!paymentAvailable ? (
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-sm text-amber-950">
            Online payment will be available soon, contact us to subscribe.{" "}
            <Link className="font-semibold underline" href="/contact">
              Contact us
            </Link>
          </div>
        ) : null}

        <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white p-1">
          {(["monthly", "yearly"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                period === key ? "bg-navy text-white" : "text-navy"
              }`}
            >
              {key === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Alert tone="error" className="mx-auto mt-6 max-w-xl text-left">
          {error}
        </Alert>
      ) : null}

      <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((plan) => {
          const base =
            period === "yearly" ? plan.priceYearlyPaise : plan.priceMonthlyPaise;
          const promo =
            plan.promotion && plan.promotion.billingPeriod === period
              ? plan.promotion.pricePaise
              : null;
          const price = promo ?? base;
          const twelveMonths = plan.priceMonthlyPaise * 12;
          const savings =
            period === "yearly" && !promo && twelveMonths > plan.priceYearlyPaise
              ? Math.round(
                  ((twelveMonths - plan.priceYearlyPaise) / twelveMonths) * 100,
                )
              : 0;

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                plan.isFeatured ? "ring-2 ring-royal" : ""
              }`}
            >
              {plan.isFeatured ? (
                <Badge tone="teal" className="absolute -top-3 left-6">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Most popular
                </Badge>
              ) : null}

              <h3 className="text-lg font-bold text-navy">{plan.name}</h3>
              {plan.description ? (
                <p className="mt-1.5 text-sm text-slate-600">{plan.description}</p>
              ) : null}

              <p className="mt-5 text-3xl font-extrabold text-navy">
                {price === 0 ? "Free" : formatPaise(price)}
                {price > 0 ? (
                  <span className="text-sm font-semibold text-slate-500">
                    {" "}
                    / {period === "yearly" ? "year" : "month"}
                  </span>
                ) : null}
              </p>

              {promo ? (
                <p className="mt-1 text-xs font-semibold text-teal">
                  {plan.promotion?.bannerText ?? plan.promotion?.label}
                </p>
              ) : savings > 0 ? (
                <p className="mt-1 text-xs font-semibold text-teal">
                  Save {savings}% versus monthly billing
                </p>
              ) : null}

              {plan.code === "employer_free" ? (
                <p className="mt-2 text-sm font-semibold text-navy">
                  One lifetime free job post per company
                </p>
              ) : plan.jobPostsPerMonth ? (
                <p className="mt-2 text-sm font-semibold text-navy">
                  {plan.jobPostsPerMonth} job posts / month
                </p>
              ) : null}

              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                {plan.features
                  .filter((f) => f.enabled)
                  .map((f) => (
                    <li key={f.key} className="flex items-start gap-2">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-teal"
                        aria-hidden="true"
                      />
                      <span>
                        {f.label ?? f.key}
                        {f.limit !== null && f.limit <= 10 ? ` (${f.limit})` : ""}
                      </span>
                    </li>
                  ))}
              </ul>

              {audience === "employer" && plan.code === "employer_free" ? (
                <Link
                  className="mt-6 w-full rounded-xl bg-royal px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-navy"
                  href={
                    !signedIn
                      ? "/register?role=recruiter"
                      : companyId
                        ? "/recruiter/jobs/new"
                        : "/recruiter/company"
                  }
                >
                  Start free
                </Link>
              ) : price > 0 && !paymentAvailable ? (
                <Link
                  className="mt-6 w-full rounded-xl border border-slate-300 px-5 py-2.5 text-center text-sm font-semibold text-navy hover:border-royal hover:text-royal"
                  href="/contact"
                >
                  Contact us to subscribe
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => startCheckout(plan)}
                  disabled={busy === plan.code || price === 0}
                  className={`mt-6 w-full rounded-xl px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    plan.isFeatured
                      ? "bg-royal text-white hover:bg-royal-600"
                      : "border border-slate-300 text-navy hover:border-royal hover:text-royal"
                  }`}
                >
                  {price === 0
                    ? "Included"
                    : busy === plan.code
                      ? "Starting..."
                      : `Choose ${plan.name}`}
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
