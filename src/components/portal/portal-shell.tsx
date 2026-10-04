'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { portalPost } from '@/lib/portal-client/client';
import { useSession } from '@/lib/portal-client/use-session';
import {
  Alert,
  Badge,
  ForbiddenState,
  LoadingState,
} from '@/components/portal/ui';
import type { PortalRole } from '@/lib/portal-client/types';

/**
 * The signed-in application shell.
 *
 * Navigation is derived from the role the SERVER reported. That matters: a
 * candidate must not even be offered an employer link, because a link that
 * leads to a 403 is a worse experience than no link — and because hiding a
 * control in the UI is not the same as authorising it (the API still refuses).
 *
 * There are deliberately NO role switcher links. A user reaches only the
 * dashboard their account actually has.
 */

interface NavItem {
  href: string;
  label: string;
}

const NAV: Record<PortalRole, NavItem[]> = {
  candidate: [
    { href: '/candidate', label: 'Dashboard' },
    { href: '/candidate/profile', label: 'Profile' },
    { href: '/candidate/resumes', label: 'Resumes' },
    { href: '/candidate/applications', label: 'Applications' },
    { href: '/candidate/interviews', label: 'Interviews' },
    { href: '/candidate/saved-jobs', label: 'Saved jobs' },
    { href: '/candidate/alerts', label: 'Job alerts' },
    { href: '/candidate/premium', label: 'Premium' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/candidate/settings', label: 'Settings' },
  ],
  employer: [
    { href: '/employer', label: 'Dashboard' },
    { href: '/employer/jobs', label: 'Jobs' },
    { href: '/employer/applications', label: 'Applications' },
    { href: '/employer/interviews', label: 'Interviews' },
    { href: '/employer/saved-candidates', label: 'Saved candidates' },
    { href: '/employer/subscription', label: 'Subscription' },
    { href: '/employer/credits', label: 'Credits' },
    { href: '/employer/packages', label: 'Packages' },
    { href: '/employer/invoices', label: 'Invoices' },
    { href: '/employer/submissions', label: 'Agency submissions' },
    { href: '/employer/company', label: 'Company' },
    { href: '/notifications', label: 'Notifications' },
    { href: '/employer/settings', label: 'Settings' },
  ],
  admin: [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/companies', label: 'Companies' },
    { href: '/admin/jobs', label: 'Jobs' },
    { href: '/admin/applications', label: 'Applications' },
    { href: '/admin/payments', label: 'Payments' },
    { href: '/admin/packages', label: 'Packages' },
    { href: '/admin/premium-plans', label: 'Premium plans' },
    { href: '/admin/reports', label: 'Reports' },
    { href: '/admin/audit', label: 'Audit log' },
    { href: '/admin/settings', label: 'Settings' },
  ],
};

export function PortalShell({
  allowed,
  children,
}: {
  allowed: PortalRole[];
  children: React.ReactNode;
}): React.ReactElement {
  const { status, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  // An expired or absent session must not leave the user staring at a shell
  // whose data all failed to load.
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await portalPost('/api/portal/auth/logout', {});
      router.replace('/');
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <LoadingState label="Loading your account…" />
      </div>
    );
  }

  if (status === 'anonymous' || !user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Alert kind="info">
          Your session has ended. Sign in again to continue where you left off.
        </Alert>
      </div>
    );
  }

  // The API enforces the real rule; this keeps the UI from offering a page that
  // would only ever return 403.
  if (!allowed.includes(user.role)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <ForbiddenState
          message={`This area is for ${allowed.join(' or ')} accounts. You are signed in as a ${user.role}.`}
        />
      </div>
    );
  }

  const items = NAV[user.role];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-line bg-navy-surface p-4">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">{user.role}</Badge>
              {user.emailVerified ? (
                <Badge tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/40">Verified</Badge>
              ) : (
                <Badge tone="bg-amber-500/10 text-amber-300 ring-amber-500/40">Unverified</Badge>
              )}
            </div>
          </div>

          <nav aria-label="Dashboard" className="mt-4 lg:hidden">
            <ul className="flex flex-wrap gap-2">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`inline-block rounded-md px-3 py-1.5 text-sm ${
                      isActive(pathname, item.href)
                        ? 'bg-accent text-white'
                        : 'bg-navy-surface text-slate-300 hover:text-accent'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Dashboard" className="mt-4 hidden lg:block">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      isActive(pathname, item.href)
                        ? 'bg-accent text-white'
                        : 'text-slate-300 hover:bg-paper hover:text-accent'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {!user.emailVerified ? (
            <div className="mt-4">
              <Alert kind="warning">
                <Link href="/verify-email" className="underline">
                  Verify your email address
                </Link>{' '}
                to unlock applications and posting.
              </Alert>
            </div>
          ) : null}

          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm text-slate-300 hover:border-accent hover:text-accent disabled:opacity-50 lg:w-full"
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/** Exact match for a dashboard root, prefix match for everything else. */
function isActive(pathname: string, href: string): boolean {
  if (href.split('/').filter(Boolean).length <= 1) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
