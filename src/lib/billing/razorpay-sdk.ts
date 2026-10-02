/**
 * The Razorpay browser SDK, loaded on demand and shared.
 *
 * This is the single place the checkout script is fetched. Two checkout surfaces
 * exist (Managed Support billing and the Ravelyth Talent portal) and they must
 * not each carry their own copy of the loader: two copies would mean two
 * `window.Razorpay` definitions and two competing load promises, and the second
 * component to mount would wait on a script tag that had already fired its
 * `load` event, so it would hang in "loading" forever.
 *
 * SECURITY: only the PUBLIC key id is ever passed to the SDK. The key secret
 * stays on the server, where it is used to create orders and to verify payment
 * signatures. Nothing in this file may ever reference a secret, because
 * anything in a 'use client' module is shipped to the browser.
 */

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayModal {
  open(): void;
  on(event: string, callback: (payload?: unknown) => void): void;
}

export interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayModal;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise: Promise<void> | null = null;

/**
 * Loads the checkout script once per page.
 *
 * Resolves immediately if the SDK is already present, and reuses the in-flight
 * promise for concurrent callers. An existing tag that has already loaded is
 * resolved from the global rather than by waiting for an event that will never
 * fire again.
 */
export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('The payment window can only run in a browser.'));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      // A tag from a previous mount that already executed: the global is the
      // only reliable signal that it is usable.
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('script load failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      // Clear the memoised promise so a later attempt can retry rather than
      // being permanently stuck on a rejected load.
      scriptPromise = null;
      reject(new Error('script load failed'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}
