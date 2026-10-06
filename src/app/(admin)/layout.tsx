import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-user";
import { AdminActionError } from "@/components/admin/admin-action-error";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-10 sm:px-6">
      <nav
        aria-label="Admin navigation"
        className="mb-8 flex flex-wrap gap-3 border-b border-slate-200 pb-4 text-sm font-semibold"
      >
        <Link className="text-navy hover:text-royal" href="/admin">Overview</Link>
        <Link className="text-navy hover:text-royal" href="/admin/companies">Companies</Link>
        <Link className="text-navy hover:text-royal" href="/admin/jobs">Jobs</Link>
        <Link className="text-navy hover:text-royal" href="/admin/reports">Reports</Link>
        <Link className="text-navy hover:text-royal" href="/admin/add-ons">Add-ons</Link>
        <Link className="text-navy hover:text-royal" href="/admin/plans">Plans</Link>
        <Link className="text-navy hover:text-royal" href="/admin/users">Users</Link>
        <Link className="text-navy hover:text-royal" href="/admin/categories">Categories</Link>
        <Link className="text-navy hover:text-royal" href="/admin/settings">Settings</Link>
        <Link className="text-navy hover:text-royal" href="/admin/emails">Email</Link>
        <Link className="text-navy hover:text-royal" href="/admin/audit">Audit log</Link>
        <Link className="text-navy hover:text-royal" href="/admin/support">Support</Link>
        <Link className="text-navy hover:text-royal" href="/admin/blog">Blog</Link>
        <Link className="text-navy hover:text-royal" href="/admin/reviews">Reviews</Link>
        <Link className="text-navy hover:text-royal" href="/admin/billing">Billing</Link>
      </nav>
      <Suspense fallback={null}>
        <AdminActionError />
      </Suspense>
      {children}
    </main>
  );
}
