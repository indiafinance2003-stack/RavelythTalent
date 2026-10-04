import Link from "next/link";
import { requireAdmin } from "@/lib/auth/current-user";

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
        <Link className="text-navy hover:text-royal" href="/admin/add-ons">Add-ons</Link>
      </nav>
      {children}
    </main>
  );
}
