import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { PortalLoginForm } from '@/components/portal/auth/portal-login-form';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Sign in — Ravelyth Talent',
  description: 'Sign in to your Ravelyth Talent candidate, employer or agency account.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/login' },
};

/**
 * Sign in.
 *
 * Uses the portal login endpoint, which works for every account role because it
 * looks the user up by email rather than assuming a role. The destination is
 * chosen from the role the SERVER returned, never from anything the browser
 * claims, so there is no way to land on a dashboard the account cannot use.
 */
export default async function LoginPage(): Promise<React.ReactElement> {
  try {
    const user = await currentPortalUser();
    if (user) {
      redirect(user.role === 'employer' ? '/employer' : user.role === 'admin' ? '/admin' : '/candidate');
    }
  } catch {
    // Not signed in.
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in to your candidate, employer or recruitment agency account.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-navy-surface p-6">
        <Suspense fallback={<LoadingState label="Loading…" />}>
          <PortalLoginForm />
        </Suspense>
      </div>
    </div>
  );
}
