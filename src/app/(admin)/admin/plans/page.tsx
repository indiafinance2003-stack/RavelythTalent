import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { savePlanAction, savePromotionAction } from "@/lib/admin/plan-actions";
import { db } from "@/lib/db";
import { planFeatures, planPromotions, plans } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Plans and promotions" };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

function PlanForm({
  plan,
  features,
}: {
  plan?: typeof plans.$inferSelect;
  features: Array<typeof planFeatures.$inferSelect>;
}) {
  const featureText = features
    .map((feature) => [
      feature.featureKey,
      String(feature.isEnabled),
      feature.limitValue ?? "",
      feature.label ?? "",
    ].join("|"))
    .join("\n");

  return (
    <form action={savePlanAction} className="grid gap-3 md:grid-cols-2">
      {plan ? <input name="id" type="hidden" value={plan.id} /> : null}
      <label className="text-sm font-medium text-navy">
        Code
        <input className={fieldClass} defaultValue={plan?.code} maxLength={60} minLength={2} name="code" pattern="[a-z0-9_-]+" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Name
        <input className={fieldClass} defaultValue={plan?.name} maxLength={120} minLength={2} name="name" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Audience
        <select className={fieldClass} defaultValue={plan?.audience ?? "candidate"} name="audience">
          <option value="candidate">Candidate</option>
          <option value="employer">Employer</option>
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Job posts / month (blank = no plan-level limit)
        <input className={fieldClass} defaultValue={plan?.jobPostsPerMonth ?? ""} min="1" name="jobPostsPerMonth" type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Monthly price (paise)
        <input className={fieldClass} defaultValue={plan?.priceMonthlyPaise ?? 0} min="0" name="priceMonthlyPaise" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Yearly price (paise)
        <input className={fieldClass} defaultValue={plan?.priceYearlyPaise ?? 0} min="0" name="priceYearlyPaise" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Sort order
        <input className={fieldClass} defaultValue={plan?.sortOrder ?? 0} min="0" name="sortOrder" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Description
        <input className={fieldClass} defaultValue={plan?.description ?? ""} maxLength={1000} name="description" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Entitlements (one per line: <code>key|true-or-false|limit-or-blank|label</code>)
        <textarea className={`${fieldClass} font-mono text-xs`} defaultValue={featureText} maxLength={12000} name="features" rows={Math.min(12, Math.max(4, features.length + 1))} />
      </label>
      <div className="flex flex-wrap gap-5 text-sm font-medium text-navy md:col-span-2">
        <label className="flex items-center gap-2">
          <input defaultChecked={plan?.isActive ?? true} name="isActive" type="checkbox" />
          Active
        </label>
        <label className="flex items-center gap-2">
          <input defaultChecked={plan?.isFeatured ?? false} name="isFeatured" type="checkbox" />
          Featured
        </label>
      </div>
      <div className="md:col-span-2">
        <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">{plan ? "Save plan" : "Create plan"}</button>
      </div>
    </form>
  );
}

function toIndiaInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

function PromotionForm({
  promotion,
  availablePlans,
}: {
  promotion?: typeof planPromotions.$inferSelect;
  availablePlans: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={savePromotionAction} className="grid gap-3 md:grid-cols-2">
      {promotion ? <input name="id" type="hidden" value={promotion.id} /> : null}
      <label className="text-sm font-medium text-navy">
        Plan
        <select className={fieldClass} defaultValue={promotion?.planId ?? availablePlans[0]?.id} name="planId" required>
          {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Code
        <input className={fieldClass} defaultValue={promotion?.code} maxLength={60} minLength={2} name="code" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Label
        <input className={fieldClass} defaultValue={promotion?.label} maxLength={120} minLength={2} name="label" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Price (paise)
        <input className={fieldClass} defaultValue={promotion?.pricePaise ?? ""} min="1" name="pricePaise" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Billing period
        <select className={fieldClass} defaultValue={promotion?.billingPeriod ?? "yearly"} name="billingPeriod">
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Banner text
        <input className={fieldClass} defaultValue={promotion?.bannerText ?? ""} maxLength={240} name="bannerText" />
      </label>
      <label className="text-sm font-medium text-navy">
        Starts (India time)
        <input className={fieldClass} defaultValue={toIndiaInput(promotion?.startsAt ?? null)} name="startsAt" type="datetime-local" />
      </label>
      <label className="text-sm font-medium text-navy">
        Ends (India time)
        <input className={fieldClass} defaultValue={toIndiaInput(promotion?.endsAt ?? null)} name="endsAt" type="datetime-local" />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-navy">
        <input defaultChecked={promotion?.isActive ?? false} name="isActive" type="checkbox" />
        Active
      </label>
      <div>
        <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">{promotion ? "Save promotion" : "Create promotion"}</button>
      </div>
    </form>
  );
}

export default async function AdminPlansPage() {
  const [planRows, featureRows, promotionRows] = await Promise.all([
    db.select().from(plans).orderBy(asc(plans.sortOrder)),
    db.select().from(planFeatures),
    db.select().from(planPromotions).orderBy(asc(planPromotions.createdAt)),
  ]);
  const availablePlans = planRows.map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <PageHeader title="Plans and promotions" description="Manage prices in paise, feature entitlements and offer windows. The seeded employer_free plan is listed below; configure its company-wide lifetime post count in Site Settings." />
      <Card>
        <h2 className="mb-4 text-base font-bold text-navy">Create plan</h2>
        <PlanForm features={[]} />
      </Card>
      {planRows.map((plan) => (
        <Card key={plan.id}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-navy">{plan.name}</h2>
            <span className="text-xs font-semibold text-slate-500">{plan.isActive ? "Active" : "Inactive"}</span>
          </div>
          <PlanForm plan={plan} features={featureRows.filter((feature) => feature.planId === plan.id)} />
        </Card>
      ))}
      <Card>
        <h2 className="mb-4 text-base font-bold text-navy">Create promotion</h2>
        {availablePlans.length > 0 ? <PromotionForm availablePlans={availablePlans} /> : <p className="text-sm text-slate-600">Create a plan first.</p>}
      </Card>
      {promotionRows.map((promotion) => (
        <Card key={promotion.id}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-navy">{promotion.label} <span className="font-normal text-slate-500">({promotion.code})</span></h2>
            <span className="text-xs font-semibold text-slate-500">{promotion.isActive ? "Active" : "Inactive"}</span>
          </div>
          <PromotionForm promotion={promotion} availablePlans={availablePlans} />
        </Card>
      ))}
    </div>
  );
}
