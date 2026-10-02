'use client';

import { useCallback, useEffect, useState } from 'react';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { loadRazorpayScript, type RazorpayPaymentResponse } from '@/lib/billing/razorpay-sdk';

/**
 * A payment attempt exactly as the SERVER created it.
 *
 * `amountMinor` and `currency` come from the order the server returned, not from
 * whatever the page happened to be displaying. That is deliberate: the provider
 * window is opened with the server's numbers, so the amount the customer
 * authorises and the amount that is later verified are provably the same value.
 * Passing the browser's copy of the price would reintroduce precisely the
 * tampering the server-side price exists to prevent.
 */
export interface StartedCheckout {
  orderNumber: string;
  amountMinor: number;
  currency: string;
  /** The gateway order the server created. */
  providerOrderId: string;
  /** Public key id only. Never a secret. */
  providerKeyId: string;
}

export type CheckoutPhase =
  /** The provider SDK has not been fetched yet. */
  | 'loading'
  /** Ready to open the provider window. */
  | 'ready'
  /** An order is being created server-side. */
  | 'starting'
  /** The provider window is open, waiting on the customer. */
  | 'awaiting'
  /** The signature was sent; the server is verifying it. */
  | 'confirming'
  /** The server confirmed the payment. */
  | 'succeeded'
  /** The customer dismissed the window. Nothing was charged. */
  | 'cancelled'
  /** The payment could not be completed. */
  | 'failed';

export interface CheckoutLabels {
  name: string;
  description: string;
  customerName: string;
  customerEmail: string;
}

export interface PortalCheckout {
  phase: CheckoutPhase;
  /** The in-flight checkout, kept so the UI can name the order it relates to. */
  current: StartedCheckout | null;
  error: string | null;
  /** True when the server refused because payments are not configured. */
  unavailable: boolean;
  /**
   * Creates a server-priced order via `start`, then opens the provider window.
   * Resolves once the customer has been shown the modal, NOT when payment
   * settles — watch `phase` for the outcome.
   */
  pay: (start: () => Promise<StartedCheckout>, labels: CheckoutLabels) => Promise<void>;
  /** Clears the outcome so the customer can try again. */
  reset: () => void;
}

/** Shown when the server reports payments are not configured. */
export const CHECKOUT_UNAVAILABLE_MESSAGE =
  'Payments are not available on this account right now. No order was created and you have not been charged.';

/** Phases in which a checkout is in flight and must not be started again. */
export function isCheckoutBusy(phase: CheckoutPhase): boolean {
  return phase === 'starting' || phase === 'awaiting' || phase === 'confirming';
}

/**
 * The browser half of portal checkout.
 *
 * The trust model, stated once so it is not re-decided per screen:
 *
 *  1. The browser cannot set a price. It sends only an identifier (a package or
 *     a plan id) and the server quotes the amount from its own row.
 *  2. The browser cannot mark an order paid. The only call that can do that is
 *     `/api/portal/payments/confirm`, which re-verifies the provider signature
 *     server-side against the STORED order before granting anything.
 *  3. The provider's success callback is a SIGNAL, not authority. If the confirm
 *     call fails, the UI reports failure even though the customer may well have
 *     been charged; the signed webhook remains the source of truth. Announcing
 *     success without a server answer would be a lie the customer acts on.
 */
export function usePortalCheckout(): PortalCheckout {
  const [phase, setPhase] = useState<CheckoutPhase>('loading');
  const [current, setCurrent] = useState<StartedCheckout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadRazorpayScript()
      .then(() => {
        if (!disposed) setPhase('ready');
      })
      .catch(() => {
        if (disposed) return;
        setPhase('failed');
        setError('The secure payment window could not be loaded. Check your connection and try again.');
      });
    return () => {
      disposed = true;
    };
  }, []);

  const pay = useCallback(
    async (start: () => Promise<StartedCheckout>, labels: CheckoutLabels): Promise<void> => {
      setError(null);
      setUnavailable(false);

      if (isCheckoutBusy(phase)) return;

      if (phase === 'loading') {
        setError('The secure payment window is still loading. Try again in a moment.');
        return;
      }

      const Razorpay = typeof window === 'undefined' ? undefined : window.Razorpay;
      if (!Razorpay) {
        setPhase('failed');
        setError('The secure payment window could not be loaded. Please try again.');
        return;
      }

      setPhase('starting');
      let checkout: StartedCheckout;
      try {
        // `start` performs the order-creating request. Everything used below
        // comes from its response, which is the server's own view of the order.
        checkout = await start();
      } catch (caught) {
        const message = formatApiError(caught);
        const offline = /not available|not configured/i.test(message);
        setUnavailable(offline);
        setError(offline ? CHECKOUT_UNAVAILABLE_MESSAGE : message);
        setPhase('failed');
        return;
      }

      // A missing gateway order means nothing was actually created, so there is
      // nothing payable and nothing to claim.
      if (!checkout.providerKeyId || !checkout.providerOrderId) {
        setUnavailable(true);
        setError(CHECKOUT_UNAVAILABLE_MESSAGE);
        setPhase('failed');
        return;
      }

      setCurrent(checkout);
      setPhase('awaiting');


      const modal = new Razorpay({
        // PUBLIC key id only. The key secret never reaches the browser; it stays
        // on the server, where orders are created and signatures verified.
        key: checkout.providerKeyId,
        // The SERVER's amount and currency, so what is authorised is exactly
        // what will later be verified.
        amount: checkout.amountMinor,
        currency: checkout.currency,
        order_id: checkout.providerOrderId,
        name: labels.name,
        description: labels.description,
        prefill: { name: labels.customerName, email: labels.customerEmail },
        theme: { color: '#2563eb' },
        handler: (response: RazorpayPaymentResponse) => {
          void (async () => {
            setPhase('confirming');
            try {
              const result = await portalPost<{
                paid: boolean;
                alreadyProcessed: boolean;
                grantedCredits: number | null;
                orderStatus: string;
              }>('/api/portal/payments/confirm', {
                // Exactly the three fields the provider returned. No amount is
                // sent, because the server reads it from the stored order.
                providerPaymentId: response.razorpay_payment_id,
                providerOrderId: response.razorpay_order_id,
                signature: response.razorpay_signature,
              });

              // The server's own answer decides the outcome. A response that
              // does not affirmatively say `paid` is never shown as success.
              if (!result.paid) {
                setPhase('failed');
                setError(
                  'The payment was not confirmed. If you were charged it will appear on your statement and the order will be reconciled automatically.'
                );
                return;
              }
              setPhase('succeeded');
            } catch (caught) {
              setPhase('failed');
              setError(
                `${formatApiError(caught)} If you were charged, it will be reconciled automatically — this page will not report success without the server confirming it.`
              );
            }
          })();
        },
        modal: {
          // Dismissing the window is a CANCELLATION, not a failure: nothing was
          // charged, and the order simply stays awaiting payment until it expires.
          ondismiss: () => {
            setPhase('cancelled');
          },
        },
      });

      // A declined card is reported by the provider distinctly from a dismissal.
      modal.on('payment.failed', (payload?: unknown) => {
        const description =
          payload && typeof payload === 'object' && 'error' in payload
            ? String((payload as { error?: { description?: string } }).error?.description ?? '')
            : '';
        setPhase('failed');
        setError(description || 'The payment did not complete. Nothing has been granted.');
      });

      try {
        modal.open();
      } catch {
        setPhase('failed');
        setError('The payment window could not be opened. Please try again.');
      }
    },
    [phase]
  );

  const reset = useCallback(() => {
    setPhase('ready');
    setCurrent(null);
    setError(null);
    setUnavailable(false);
  }, []);

  return { phase, current, error, unavailable, pay, reset };
}

