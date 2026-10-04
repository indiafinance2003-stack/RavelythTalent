import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { saveCategoryAction } from "@/lib/admin/category-actions";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Category management" };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

function CategoryForm({
  category,
  options,
}: {
  category?: typeof categories.$inferSelect;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={saveCategoryAction} className="grid gap-3 md:grid-cols-2">
      {category ? <input name="id" type="hidden" value={category.id} /> : null}
      <label className="text-sm font-medium text-navy">
        Name
        <input className={fieldClass} defaultValue={category?.name} maxLength={120} minLength={2} name="name" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Slug
        <input className={fieldClass} defaultValue={category?.slug} maxLength={140} minLength={2} name="slug" pattern="[a-z0-9-]+" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Parent
        <select className={`${fieldClass} bg-white`} defaultValue={category?.parentId ?? ""} name="parentId">
          <option value="">None</option>
          {options.filter((item) => item.id !== category?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-navy">
        Sort order
        <input className={fieldClass} defaultValue={category?.sortOrder ?? 0} max="10000" min="0" name="sortOrder" required type="number" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Description
        <textarea className={fieldClass} defaultValue={category?.description ?? ""} maxLength={500} name="description" rows={2} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-navy">
        <input defaultChecked={category?.isActive ?? true} name="isActive" type="checkbox" />
        Active
      </label>
      <div>
        <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">{category ? "Save category" : "Create category"}</button>
      </div>
    </form>
  );
}

export default async function AdminCategoriesPage() {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const options = rows.map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <PageHeader title="Categories" description="Edit and deactivate job-search categories." />
      <Card><h2 className="mb-4 font-bold text-navy">Create category</h2><CategoryForm options={options} /></Card>
      {rows.map((category) => (
        <Card key={category.id}>
          <div className="mb-3 flex justify-between gap-3">
            <h2 className="font-bold text-navy">{category.name}</h2>
            <span className="text-xs text-slate-500">{category.isActive ? "Active" : "Inactive"}</span>
          </div>
          <CategoryForm category={category} options={options} />
        </Card>
      ))}
    </div>
  );
}
