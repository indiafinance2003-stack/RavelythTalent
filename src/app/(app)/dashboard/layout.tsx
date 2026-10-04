import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Bookmark,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logoutAction } from "@/lib/auth/actions";
import { countUnreadNotifications } from "@/lib/notifications";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/applications", label: "Applications", icon: BriefcaseBusiness },
  { href: "/dashboard/saved", label: "Saved jobs", icon: Bookmark },
  { href: "/dashboard/resumes", label: "Resumes", icon: FileText },
  { href: "/dashboard/alerts", label: "Job alerts", icon: Bell },
  { href: "/dashboard/profile", label: "My profile", icon: UserRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fdashboard");
  if (!user.emailVerifiedAt) redirect("/verify-email");

  const unread = await countUnreadNotifications(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-offwhite">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
            Candidate dashboard
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dashboard/notifications"
              className="relative rounded-xl border border-slate-300 p-2 text-navy hover:border-royal"
              aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unread > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-royal px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-navy hover:border-royal"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:px-8">
        <nav aria-label="Dashboard" className="lg:w-60 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-navy transition",
                    "hover:bg-sky-tint/60",
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}