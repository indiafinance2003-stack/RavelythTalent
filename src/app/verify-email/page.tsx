import { Suspense } from 'react';
import type { Metadata } from 'next';
import { currentPortalUser } from '@/lib/portal/auth-context';
import { VerifyEmailPanel } from '@/components/portal/auth/verify-email-panel';
import { LoadingState } from '@/components/portal/ui';

export const metadata: Metadata = {
  title: 'Verify your email — Ravelyth Talent',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ token?: string }> };

/**
 * Verification landing page.
 *
 * The token normally arrives as a `?token=` query parameter from the emailed
 * link. It is pre-filled into the form rather than submitted automatically,
 * because a single-use token should be spent by an explicit action.
 */
export default async function VerifyEmailPage({
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const params = await searchParams;

  let email: string | null = null;
  try {
    email = (await currentPortalUser())?.email ?? null;
  } catch {
    email = null;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Email verification</h1>
      <p className="mt-2 text-sm text-muted">
        A verified email address is required before you can apply for a role.
      </p>

      <div className="mt-8 rounded-xl border border-line bg-navy-surface p-6">
        <Suspense fallback={<LoadingState label="Loading…" />}>
          <VerifyEmailPanel initialToken={params.token ?? null} email={email} />
        </Suspense>
      </div>
    </div>
  );
}
