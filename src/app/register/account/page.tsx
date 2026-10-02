import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterForm } from '@/components/auth/register-form';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Create a tools account',
  description: 'Create a free Ravelyth account to save DNS analyses.',
  robots: { index: false, follow: false },
};

export default async function RegisterPage(): Promise<React.ReactElement> {
  // Already signed in visitors go straight to their account.
  if (await getSessionUser()) {
    redirect('/account');
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Create account</h1>
      <p className="mt-2 text-sm text-muted">
        A free account lets you save DNS lookup results for later. Public tools remain available without an
        account.
      </p>
      <div className="mt-8 rounded-xl border border-line bg-navy-surface p-6">
        <RegisterForm />
      </div>
    </div>
  );
}
