'use client';

import { Alert, Button } from '@/components/portal/ui';
import { formatMoney } from '@/lib/portal-client/format';
import {
  isCheckoutBusy,
  type CheckoutLabels,
  type PortalCheckout,
  type StartedCheckout,
} from '@/components/portal/checkout/use-portal-checkout';

/**
 * The outcome of a checkout, rendered identically wherever payment happens.
 *
 * Every state the provider can produce is represented explicitly, because the
 * difference between "cancelled", "declined" and "paid but not yet confirmed" is
 * exactly what stops a customer from paying twice:
 *
 *  - cancelled: nothing was charged, and the order is still open to pay.
 *  - failed: the provider declined, or the signature did not verify. Nothing was
 *    granted. If money actually left the account it is reconciled by webhook.
 *  - succeeded: the SERVER confirmed it, and only then is anything granted.
 */
export function CheckoutStatus({
  checkout,
  orderNumber,
  onRetry,
}: {
  checkout: PortalCheckout;
  /** The order the status refers to, for the confirmation message. */
  orderNumber?: string | null;
  onRetry?: () => void;
}): React.ReactElement | null {
  const { phase, error, unavailable } = checkout;

  if (phase === 'succeeded') {
    return (
      <Alert kind="success">
        <p>
          Payment confirmed{orderNumber ? ` for order ${orderNumber}` : ''}. The credits or
          subscription have been added to your account.
        </p>
        {onRetry ? (
          <p className="mt-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Done
            </Button>
          </p>
        ) : null}
      </Alert>
    );
  }

  if (phase === 'cancelled') {
    return (
      <Alert kind="info">
        <p>
          Checkout was cancelled. You were not charged{orderNumber ? `, and order ${orderNumber} is still awaiting payment` : ''}.
        </p>
        {onRetry ? (
          <p className="mt-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Start again
            </Button>
          </p>
        ) : null}
      </Alert>
    );
  }

  if (phase === 'failed') {
    return (
      <Alert kind={unavailable ? 'warning' : 'error'}>
        <p>{error ?? 'The payment could not be completed.'}</p>
        {onRetry && !unavailable ? (
          <p className="mt-2">
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </p>
        ) : null}
      </Alert>
    );
  }

  if (isCheckoutBusy(phase)) {
    return (
      <Alert kind="info">
        {phase === 'confirming'
          ? 'Confirming the payment with our servers. Please stay on this page.'
          : 'Opening the secure payment window…'}
      </Alert>
    );
  }

  return null;
}

/** Builds the order-starting call the checkout hook expects, from a server response. */
export function toStartedCheckout(response: {
  order: { orderNumber: string; amountMinor: number; currency: string };
  providerOrderId: string;
  providerKeyId: string | null;
}): StartedCheckout {
  return {
    orderNumber: response.order.orderNumber,
    // Server-quoted amount. Never re-read from the page's own copy of the price.
    amountMinor: response.order.amountMinor,
    currency: response.order.currency,
    providerOrderId: response.providerOrderId,
    providerKeyId: response.providerKeyId ?? '',
  };
}

/** Convenience label builder so each surface does not restate the branding. */
export function portalLabels(
  description: string,
  customer: { name: string; email: string }
): CheckoutLabels {
  return {
    name: 'Ravelyth Talent',
    description,
    customerName: customer.name,
    customerEmail: customer.email,
  };
}

/** Formats an amount for a pay button, using the server's own minor units. */
export function checkoutAmountLabel(checkout: StartedCheckout | null, fallback: string): string {
  return checkout ? `Pay ${formatMoney(checkout.amountMinor, checkout.currency)}` : fallback;
}
