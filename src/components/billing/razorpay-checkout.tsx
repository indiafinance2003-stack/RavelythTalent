'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePaymentSession } from '@/lib/billing/use-payment-session';
import {
  loadRazorpayScript,
  type RazorpayPaymentResponse,
} from '@/lib/billing/razorpay-sdk';

interface RazorpayCheckoutProps {
  sessionId: string;
  providerOrderId: string;
  providerKeyId: string;
  amountMinor: number;
  currency: string;
  customerName: string;
  customerEmail: string;
}

export function RazorpayCheckout({
  sessionId,
  providerOrderId,
  providerKeyId,
  amountMinor,
  currency,
  customerName,
  customerEmail,
}: RazorpayCheckoutProps): React.ReactElement {
  const router = useRouter();
  const { verifyPayment, cancelCheckout } = usePaymentSession();
  const [state, setState] = useState<'loading' | 'ready' | 'processing' | 'success' | 'error'>(
    'loading'
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    loadRazorpayScript()
      .then(() => {
        if (!disposed) setState('ready');
      })
      .catch(() => {
        if (!disposed) {
          setState('error');
          setError('The secure payment window could not be loaded. Please try again.');
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  const handlePay = useCallback(async () => {
    if (state !== 'ready') return;
    const Razorpay = window.Razorpay;
    if (!Razorpay) {
      setState('error');
      setError('The secure payment window could not be loaded. Please try again.');
      return;
    }

    setState('processing');
    setError(null);

    const modal = new Razorpay({
      key: providerKeyId,
      amount: amountMinor,
      currency,
      order_id: providerOrderId,
      name: 'Ravelyth',
      description: 'Managed Support (one-time payment for one billing cycle)',
      prefill: {
        name: customerName,
        email: customerEmail,
      },
      theme: { color: '#2563eb' },
      handler: async (response: RazorpayPaymentResponse) => {
        try {
          await verifyPayment({
            checkoutSessionId: sessionId,
            providerPaymentId: response.razorpay_payment_id,
            providerOrderId: response.razorpay_order_id,
            signature: response.razorpay_signature,
          });
          setState('success');
          router.replace('/account/billing');
          router.refresh();
        } catch (err) {
          setState('error');
          setError(
            err instanceof Error
              ? err.message
              : 'Payment could not be verified. Your bank was not charged unless the payment succeeded.'
          );
        }
      },
    });

    try {
      modal.open();
    } catch {
      setState('error');
      setError('The payment window could not be opened. Please try again.');
    }
  }, [state, providerKeyId, amountMinor, currency, providerOrderId, customerName, customerEmail, sessionId, verifyPayment, router]);

  const handleCancel = useCallback(async () => {
    await cancelCheckout(sessionId);
    router.replace('/account/billing');
    router.refresh();
  }, [cancelCheckout, sessionId, router]);

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);

  if (state === 'success') {
    return (
      <p className="text-sm text-emerald-300">Payment verified — your subscription is being recorded.</p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={handlePay}
        disabled={state !== 'ready'}
        className="inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === 'processing'
          ? 'Waiting for the secure window…'
          : state === 'loading'
            ? 'Loading secure payment…'
            : `Pay ${formatted}`}
      </button>
      <button
        type="button"
        onClick={handleCancel}
        disabled={state === 'processing'}
        className="text-sm text-slate-400 underline-offset-2 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel checkout
      </button>
      {error ? (
        <p role="alert" className="max-w-md text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {state === 'ready' ? (
        <p className="max-w-md text-xs text-slate-500">
          Payment is processed by the configured provider over its own secure window. No card details
          pass through this website.
        </p>
      ) : null}
    </div>
  );
}
