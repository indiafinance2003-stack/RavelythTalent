'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { Alert, Button, Field, inputClass } from '@/components/portal/ui';

/**
 * Portal sign-in.
 *
 * The backend returns an identical error for an unknown email and a wrong
 * password, so this form can never be used to discover which addresses are
 * registered. On success the destination comes from the role the server
 * returned.
 */
export function PortalLoginForm(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await portalPost<{ user: { role: string } }>('/api/portal/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      const role = result.user.role;
      router.push(role === 'employer' ? '/employer' : role === 'admin' ? '/admin' : '/candidate');
      router.refresh();
    } catch (caught) {
      setError(formatApiError(caught));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <Field label="Email address" htmlFor="login-email">
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field label="Password" htmlFor="login-password">
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClass}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" loading={loading} className="w-full">
        Sign in
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-slate-400 hover:text-accent">
          Forgot password?
        </Link>
        <Link href="/register" className="text-accent-soft hover:text-accent">
          Create an account
        </Link>
      </div>
    </form>
  );
}
