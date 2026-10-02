'use client';

import { useState } from 'react';
import Link from 'next/link';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { Alert, Button, Field, inputClass } from '@/components/portal/ui';

/**
 * Email verification and resend.
 *
 * Verification CONSUMES a single-use token, so it is presented once and then
 * replaced by the outcome. Resending issues a new link and invalidates every
 * previous unused token, which is why the two are on the same page.
 *
 * The resend endpoint deliberately gives an identical answer for a known and an
 * unknown address, so this cannot be used to discover which emails are
 * registered.
 */
export function VerifyEmailPanel({
  initialToken,
  email,
}: {
  initialToken: string | null;
  email: string | null;
}): React.ReactElement {
  const [token, setToken] = useState(initialToken ?? '');
  const [resendEmail, setResendEmail] = useState(email ?? '');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyDone, setVerifyDone] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function verify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setVerifyError(null);
    if (token.trim().length === 0) {
      setVerifyError('Paste the token from your verification email.');
      return;
    }
    setVerifying(true);
    try {
      await portalPost('/api/portal/auth/verify-email', { token: token.trim() });
      setVerifyDone(true);
    } catch (caught) {
      setVerifyError(formatApiError(caught));
    } finally {
      setVerifying(false);
    }
  }

  async function resend(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setResendMessage(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resendEmail.trim())) {
      setResendMessage('Enter a valid email address.');
      return;
    }
    setResending(true);
    try {
      const result = await portalPost<{ message?: string; emailDelivered?: boolean }>(
        '/api/portal/auth/resend-verification',
        { email: resendEmail.trim().toLowerCase() }
      );
      // The response is deliberately non-committal; report it as given.
      setResendMessage(
        result.message ?? 'If that address needs verifying, a new link has been sent.'
      );
    } catch (caught) {
      setResendMessage(formatApiError(caught));
    } finally {
      setResending(false);
    }
  }

  if (verifyDone) {
    return (
      <div className="space-y-4">
        <Alert kind="success">
          Your email address is verified. You can now apply for roles and use all the tools your account
          allows.
        </Alert>
        <Link
          href="/candidate"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form onSubmit={verify} noValidate className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Verify your email address</h2>
          <p className="mt-1 text-sm text-slate-400">
            We sent a verification link when you registered. Paste the token from that email below, or
            request a new link.
          </p>
        </div>

        {verifyError ? <Alert kind="error">{verifyError}</Alert> : null}

        <Field
          label="Verification token"
          htmlFor="verify-token"
          hint="The token is the long code in your verification email."
        >
          <input
            id="verify-token"
            className={inputClass}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="one-time-code"
          />
        </Field>

        <Button type="submit" loading={verifying}>
          Verify my email
        </Button>
      </form>

      <form onSubmit={resend} noValidate className="space-y-4 border-t border-line pt-6">
        <div>
          <h2 className="text-base font-semibold text-ink">Send a new link</h2>
          <p className="mt-1 text-sm text-slate-400">
            Requesting a new link invalidates any earlier unused one.
          </p>
        </div>

        {resendMessage ? <Alert kind="info">{resendMessage}</Alert> : null}

        <Field label="Email address" htmlFor="resend-email">
          <input
            id="resend-email"
            type="email"
            className={inputClass}
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
            autoComplete="email"
          />
        </Field>

        <Button type="submit" variant="secondary" loading={resending}>
          Resend verification email
        </Button>
      </form>
    </div>
  );
}
