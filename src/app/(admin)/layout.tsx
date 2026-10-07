import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-user";
import { AdminActionError } from "@/components/admin/admin-action-error";
import { DashboardShell, TopBarSearch, type SearchScope } from "@/components/dashboard/shell";
import { Logo } from "@/components/brand/logo";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inboxThreads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const SEARCH_SCOPES: SearchScope[] = [
  { value: "users", label: "Users", href: "/admin/users" },
  { value: "leads", label: "Leads", href: "/admin/assistant/leads" },
  { value: "jobs", label: "Jobs", href: "/jobs" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  const [attentionRow] = await db
    .select({ value: count() })
    .from(inboxThreads)
    .where(eq(inboxThreads.needsAttention, true));
  const attentionCount = attentionRow?.value ?? 0;

  return (
    <DashboardShell
      actions={
        <Suspense fallback={null}>
          <AdminActionError />
        </Suspense>
      }
      bell={{
        count: attentionCount,
        href: "/admin/assistant?attention=true",
        label: "Assistant threads needing attention",
      }}
      brand={<Logo href="/admin" />}
      search={<TopBarSearch placeholder="Search" scopes={SEARCH_SCOPES} />}
      user={{ name: user.fullName, role: user.role }}
      variant="admin"
    >
      {children}
    </DashboardShell>
  );
}
