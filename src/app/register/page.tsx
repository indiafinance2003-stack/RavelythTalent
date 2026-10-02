import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PortalRegisterForm } from '@/components/portal/auth/portal-register-form';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Create your account — Ravelyth Talent',
  description:
    'Register on Ravelyth Talent as a candidate, an employer, or a recruitment agency. Consent is recorded separately for each purpose.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/register' },
};

/**
 * Portal registration.
 *
 * Already-signed-in visitors are sent to the dashboard for their role. The
 * session lookup is best-effort so a missing database never turns a marketing
 * page into a 500.
 */
export default async function RegisterPage(): Promise<React.ReactElement> {
  try {
    const user = await currentPortalUser();
    if (user) {
      redirect(user.role === 'employer' ? '/employer' : user.role === 'admin' ? '/admin' : '/candidate');
    }
  } catch {
    // Treat an unavailable session as "not signed in".
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mt-2 text-sm text-muted">
        Join Ravelyth Talent to apply for roles, or to hire and manage candidates.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-navy-surface p-6">
        <Suspense fallback={<LoadingState label="Loading the form…" />}>
          <PortalRegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
