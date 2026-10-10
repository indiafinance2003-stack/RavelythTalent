"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Package,
  PenLine,
  PieChart,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  UserRound,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { cn, initials } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Navigation configuration                                                   */
/* -------------------------------------------------------------------------- */

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (used for the dashboard home links). */
  exact?: boolean;
  /** Only shown while the global chat feature is enabled. */
  chat?: boolean;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

export type ShellVariant = "admin" | "candidate" | "employer";

const ADMIN_NAV: NavGroup[] = [
  { items: [{ href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    label: "Marketplace",
    items: [
      { href: "/admin/companies", label: "Companies", icon: Building2 },
      { href: "/admin/jobs", label: "Jobs", icon: BriefcaseBusiness },
      { href: "/admin/reports", label: "Reports", icon: ShieldCheck },
      { href: "/admin/users", label: "Users", icon: UsersRound },
    ],
  },
  {
    label: "Plans and billing",
    items: [
      { href: "/admin/plans", label: "Plans", icon: PieChart },
      { href: "/admin/billing", label: "Billing", icon: CreditCard },
      { href: "/admin/add-ons", label: "Add-ons", icon: Package },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/emails", label: "Emails", icon: Mail },
      { href: "/admin/support", label: "Support", icon: MessageSquareText },
      { href: "/admin/assistant", label: "Assistant", icon: Sparkles },
      { href: "/admin/social", label: "Social", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/blog", label: "Blog", icon: PenLine },
      { href: "/admin/reviews", label: "Reviews", icon: Star },
      { href: "/admin/categories", label: "Categories", icon: Tags },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/audit", label: "Audit log", icon: FileText },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const CANDIDATE_NAV: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/jobs", label: "Find jobs", icon: Search },
      { href: "/dashboard/applications", label: "Applications", icon: BriefcaseBusiness },
      { href: "/dashboard/saved", label: "Saved jobs", icon: Bookmark },
      { href: "/dashboard/alerts", label: "Job alerts", icon: Bell },
      { href: "/dashboard/resume-builder", label: "Resume builder", icon: FileText },
      { href: "/dashboard/interviews", label: "Interviews", icon: CalendarDays },
      { href: "/dashboard/messages", label: "Messages", icon: MessagesSquare, chat: true },
      { href: "/dashboard/notifications", label: "Notifications", icon: MessageSquareText },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/resumes", label: "Resumes", icon: FileText },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/profile", label: "My profile", icon: UserRound },
    ],
  },
];

const EMPLOYER_NAV: NavGroup[] = [
  {
    items: [
      { href: "/recruiter", label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/recruiter/jobs", label: "Jobs", icon: FileText },
      { href: "/recruiter/applications", label: "Applicants", icon: UsersRound },
      { href: "/recruiter/messages", label: "Messages", icon: MessagesSquare, chat: true },
      { href: "/recruiter/interviews", label: "Interviews", icon: CalendarDays },
      { href: "/recruiter/company", label: "Company profile", icon: Building2 },
      { href: "/recruiter/billing", label: "Billing", icon: CreditCard },
      { href: "/recruiter/add-ons", label: "Add-ons", icon: Sparkles },
      { href: "/recruiter/reports", label: "Reports", icon: ChartNoAxesCombined },
      { href: "/recruiter/candidates", label: "Candidates", icon: Search },
      { href: "/recruiter/team", label: "Team", icon: UserRoundCog },
    ],
  },
];

const NAV_BY_VARIANT: Record<ShellVariant, NavGroup[]> = {
  admin: ADMIN_NAV,
  candidate: CANDIDATE_NAV,
  employer: EMPLOYER_NAV,
};

const VARIANT_LABEL: Record<ShellVariant, string> = {
  admin: "Admin console",
  candidate: "Candidate dashboard",
  employer: "Employer dashboard",
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Drops chat-only links (and any now-empty groups) when chat is disabled. */
function withChatVisibility(
  groups: NavGroup[],
  chatEnabled: boolean,
): NavGroup[] {
  if (chatEnabled) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.chat),
    }))
    .filter((group) => group.items.length > 0);
}

/* -------------------------------------------------------------------------- */
/* Nav rendering                                                              */
/* -------------------------------------------------------------------------- */

function NavGroups({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-5">
      {groups.map((group, index) => (
        <div key={group.label ?? `group-${index}`}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-sky-tint/70">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal",
                      active
                        ? "bg-white/15 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export function DashboardShell({
  variant,
  brand,
  search,
  bell,
  user,
  chatEnabled = false,
  actions,
  children,
}: {
  variant: ShellVariant;
  /** Server-rendered brand mark (Logo reads the file system, so it stays on the server). */
  brand: ReactNode;
  /** Optional search box (admin only). */
  search?: ReactNode;
  /** Notification bell target and unread count. */
  bell?: { href: string; count?: number; label: string };
  /** Signed-in user shown as an initials avatar. */
  user: { name: string; role: string };
  /** Whether chat links should be shown in the navigation. */
  chatEnabled?: boolean;
  /** Extra server-rendered content above the page (e.g. action errors). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const groups = withChatVisibility(NAV_BY_VARIANT[variant], chatEnabled);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const hadOpen = useRef(false);

  // Close the mobile drawer whenever the route changes (adjust-during-render
  // pattern from the React docs; nav links also call onNavigate directly).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  // Lock body scroll and wire up Escape while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen) hadOpen.current = true;
    else if (hadOpen.current) {
      hadOpen.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  const bellCount = bell?.count ?? 0;

  return (
    <div className="flex min-h-screen bg-offwhite">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-navy px-4 py-6 lg:flex">
        <p className="mb-6 px-3 text-sm font-extrabold tracking-tight text-white">
          {VARIANT_LABEL[variant]}
        </p>
        <nav aria-label={`${VARIANT_LABEL[variant]} navigation`} className="flex-1">
          <NavGroups groups={groups} pathname={pathname} />
        </nav>
        <form action={logoutAction} className="mt-6 border-t border-white/10 pt-4">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            type="submit"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </aside>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              ref={menuButtonRef}
              aria-controls="dashboard-drawer"
              aria-expanded={drawerOpen}
              aria-label="Open navigation menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-navy transition hover:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal lg:hidden"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            {brand}

            <span className="hidden text-xs font-semibold text-slate-500 sm:inline">
              {VARIANT_LABEL[variant]}
            </span>

            <div className="ml-auto flex items-center gap-2">
              {search}
              {bell ? (
                <Link
                  aria-label={`${bell.label}${bellCount > 0 ? ` (${bellCount} unread)` : ""}`}
                  className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-navy transition hover:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  href={bell.href}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  {bellCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-royal px-1 text-[10px] font-bold text-white">
                      {bellCount > 9 ? "9+" : bellCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}

              <span
                className="hidden h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white sm:inline-flex"
                title={user.name}
              >
                <span aria-hidden="true">{initials(user.name)}</span>
                <span className="sr-only">{user.name}</span>
              </span>

              <form action={logoutAction} className="hidden sm:block lg:hidden">
                <button
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-navy transition hover:border-royal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
                  type="submit"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden md:inline">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8" id="main-content">
          {actions}
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-navy/50"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-navy px-4 py-5 shadow-lift"
            id="dashboard-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${VARIANT_LABEL[variant]} menu`}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-extrabold text-white">
                {VARIANT_LABEL[variant]}
              </p>
              <button
                ref={closeButtonRef}
                aria-label="Close navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label={`${VARIANT_LABEL[variant]} menu`} className="flex-1">
              <NavGroups
                groups={groups}
                onNavigate={() => setDrawerOpen(false)}
                pathname={pathname}
              />
            </nav>
            <form action={logoutAction} className="mt-6 border-t border-white/10 pt-4">
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
                type="submit"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Top-bar search (admin)                                                     */
/* -------------------------------------------------------------------------- */

export type SearchScope = { value: string; label: string; href: string };

export function TopBarSearch({
  scopes,
  defaultScope,
  placeholder = "Search",
}: {
  scopes: SearchScope[];
  defaultScope?: string;
  placeholder?: string;
}) {
  const [scope, setScope] = useState(defaultScope ?? scopes[0]?.value ?? "");
  const [query, setQuery] = useState("");
  const router = useRouter();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    const target = scopes.find((entry) => entry.value === scope) ?? scopes[0];
    if (!target) return;
    const url = trimmed
      ? `${target.href}${target.href.includes("?") ? "&" : "?"}q=${encodeURIComponent(trimmed)}`
      : target.href;
    router.push(url);
  };

  if (scopes.length === 0) return null;

  return (
    <form
      className="hidden items-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-1 md:flex"
      onSubmit={submit}
      role="search"
    >
      <label className="sr-only" htmlFor="topbar-search-scope">
        Search area
      </label>
      <select
        className="bg-transparent text-xs font-semibold text-navy focus:outline-none"
        id="topbar-search-scope"
        onChange={(event) => setScope(event.target.value)}
        value={scope}
      >
        {scopes.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="h-4 w-px bg-slate-300" />
      <label className="sr-only" htmlFor="topbar-search-input">
        {placeholder}
      </label>
      <input
        className="w-36 bg-transparent px-1 py-1 text-sm text-navy placeholder:text-slate-400 focus:outline-none"
        id="topbar-search-input"
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={query}
      />
      <button
        className="rounded-lg bg-royal px-2 py-1.5 text-white hover:bg-royal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal"
        type="submit"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}
