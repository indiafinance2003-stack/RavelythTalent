import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-user";
import { AdminActionError } from "@/components/admin/admin-action-error";
import { Bell } from "lucide-react";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inboxThreads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  const [attentionRow] = await db.select({ value: count() })
    .from(inboxThreads)
    .where(eq(inboxThreads.needsAttention, true));
  const attentionCount = attentionRow?.value ?? 0;

  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-5 flex justify-end">
        <Link
          aria-label={`Assistant notifications: ${attentionCount} threads need attention`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-navy shadow-sm hover:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
          href="/admin/assistant?attention=true"
        >
          <Bell aria-hidden="true" className="h-4 w-4" />
          Assistant
          <span className="rounded-full bg-royal px-2 py-0.5 text-xs text-white">
            {attentionCount}
          </span>
        </Link>
      </div>
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
        <Link className="text-navy hover:text-royal" href="/admin/assistant">Assistant</Link>
        <Link className="text-navy hover:text-royal" href="/admin/social">Social</Link>
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
