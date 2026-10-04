import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { saveAddonAction } from "@/lib/admin/addon-actions";
import { db } from "@/lib/db";
import { addons } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Add-on management" };

function AddonFields({
  addon,
  submitLabel,
}: {
  addon?: typeof addons.$inferSelect;
  submitLabel: string;
}) {
  return (
    <form action={saveAddonAction} className="grid gap-3 md:grid-cols-2">
      {addon ? <input name="id" type="hidden" value={addon.id} /> : null}
      <label className="text-sm font-medium text-navy">
        Code
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.code} maxLength={60} minLength={2} name="code" pattern="[a-z0-9_-]+" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Name
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.name} maxLength={120} minLength={2} name="name" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Type
        <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" defaultValue={addon?.type ?? "per_job"} name="type">
          <option value="per_job">Per job</option>
          <option value="per_company">Per company</option>
          <option value="subscription">Subscription</option>
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Price (paise; leave blank to disable purchase)
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.pricePaise ?? ""} min="1" name="pricePaise" step="1" type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Duration (days)
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.durationDays ?? 30} max="3650" min="1" name="durationDays" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy">
        Sort order
        <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.sortOrder ?? 0} max="10000" min="0" name="sortOrder" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Description
        <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={addon?.description ?? ""} maxLength={1000} name="description" rows={2} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-navy">
        <input defaultChecked={addon?.isActive ?? false} name="isActive" type="checkbox" />
        Available for purchase
      </label>
      <div className="md:col-span-2">
        <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}

export default async function AdminAddonsPage() {
  const rows = await db.select().from(addons).orderBy(asc(addons.sortOrder), asc(addons.name));

  return (
    <div className="space-y-6">
      <PageHeader title="Add-ons" description="Set prices in paise and activate only configured offerings." />
      <Card>
        <h2 className="mb-4 text-base font-bold text-navy">Create add-on</h2>
        <AddonFields submitLabel="Create add-on" />
      </Card>
      {rows.map((addon) => (
        <Card key={addon.id}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-navy">{addon.name}</h2>
            <span className="text-xs font-semibold text-slate-500">{addon.isActive ? "Active" : "Inactive"}</span>
          </div>
          <AddonFields addon={addon} submitLabel="Save add-on" />
        </Card>
      ))}
    </div>
  );
}
