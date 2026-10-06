"use client";

import { useState } from "react";
import { grantOfflineSubscriptionAction } from "@/lib/admin/offline-subscription-action";

type Target = { id: string; name: string; email?: string };
type Plan = {
  id: string;
  name: string;
  priceMonthlyPaise: number;
  priceYearlyPaise: number;
};

function availablePeriods(plan: Plan | undefined): Array<"monthly" | "yearly"> {
  if (!plan) return [];
  return [
    ...(plan.priceMonthlyPaise > 0 ? ["monthly" as const] : []),
    ...(plan.priceYearlyPaise > 0 ? ["yearly" as const] : []),
  ];
}

export function SubscriptionActivationForm({
  ownerType,
  targets,
  plans,
}: {
  ownerType: "candidate" | "company";
  targets: Target[];
  plans: Plan[];
}) {
  const initialPlan = plans.find((plan) => availablePeriods(plan).includes("monthly"))
    ?? plans.find((plan) => availablePeriods(plan).length > 0);
  const [planId, setPlanId] = useState(initialPlan?.id ?? "");
  const [period, setPeriod] = useState<"monthly" | "yearly">(
    initialPlan && availablePeriods(initialPlan).includes("monthly") ? "monthly" : "yearly",
  );
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const periods = availablePeriods(selectedPlan);

  function selectPlan(nextId: string) {
    const nextPlan = plans.find((plan) => plan.id === nextId);
    const nextPeriods = availablePeriods(nextPlan);
    setPlanId(nextId);
    if (!nextPeriods.includes(period)) setPeriod(nextPeriods[0] ?? "monthly");
  }

  return (
    <form action={grantOfflineSubscriptionAction} className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="text-sm font-medium text-navy">
        Candidate or company
        <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="target" required>
          <option value="">Select an account</option>
          {targets.map((target) => (
            <option key={target.id} value={`${ownerType}:${target.id}`}>
              {target.name}{target.email ? ` · ${target.email}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Plan
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          name="planId"
          onChange={(event) => selectPlan(event.currentTarget.value)}
          required
          value={planId}
        >
          <option value="">Select a plan</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Billing period
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          name="billingPeriod"
          onChange={(event) => setPeriod(event.currentTarget.value as "monthly" | "yearly")}
          required
          value={periods.includes(period) ? period : ""}
        >
          <option value="" disabled>Select an available period</option>
          {periods.map((item) => (
            <option key={item} value={item}>{item === "monthly" ? "Monthly" : "Yearly"}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Start date
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" name="startDate" required type="date" />
      </label>
      <label className="text-sm font-medium text-navy">
        Action
        <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="mode" required>
          <option value="grant">Grant / replace</option>
          <option value="extend">Extend the current plan</option>
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Offline payment reference (optional)
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={200} name="paymentReference" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Admin notes (optional)
        <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={2000} name="notes" rows={3} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-navy">
        <input name="generateInvoice" type="checkbox" />
        Generate and email an invoice
      </label>
      <div className="md:col-span-2">
        <button
          className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy disabled:opacity-50"
          disabled={!targets.length || !plans.length || !periods.length}
          type="submit"
        >
          Activate subscription
        </button>
      </div>
    </form>
  );
}
