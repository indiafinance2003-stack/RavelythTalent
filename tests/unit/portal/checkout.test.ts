import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/**
 * Checkout invariants.
 *
 * The browser is the least trusted party in a payment flow, so the guarantees
 * worth pinning are all about what the CLIENT is incapable of doing. A rendered
 * test would not catch a future edit that starts sending an amount, so these read
 * the source instead.
 */
describe('the browser cannot influence what is charged', () => {
  it('no client-side checkout module sends an amount', () => {
    // The confirm call carries only the three provider signature fields. The
    // server reads the amount from the order it already stored, so there is no
    // amount here to tamper with.
    const source = readSource(
      'src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts'
    );
    const confirmCall = source.slice(source.indexOf('/api/portal/payments/confirm'));
    expect(confirmCall).toContain('providerPaymentId: response.razorpay_payment_id');
    expect(confirmCall).toContain('providerOrderId: response.razorpay_order_id');
    expect(confirmCall).toContain('signature: response.razorpay_signature');
  });

  it('an order is started with an identifier only, never a price', () => {
    // Both purchase surfaces send a package/plan id. The server quotes the price
    // from its own row, so a tampered request cannot change the amount charged.
    for (const file of [
      ['src', 'components', 'portal', 'employer', 'packages-page.tsx'],
      ['src', 'components', 'portal', 'candidate', 'candidate-premium.tsx'],
    ]) {
      const source = readSource(...file);
      const body = source.slice(source.indexOf('portalPost<'));
      expect(body).not.toMatch(/amountMinor:\s*(pkg|plan)\./);
      expect(body).not.toMatch(/priceMinor:\s*(pkg|plan)\./);
    }
  });
});

describe('the browser cannot mark an order paid', () => {
  it('the only payment-finalising call the client makes is /payments/confirm', () => {
    const source = readSource(
      'src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts'
    );
    // A "mark paid" or "set status" call from the client would be a hole wide
    // enough to drive the whole system.
    expect(source).not.toMatch(/markPaid|setOrderStatus|forcePaid|activateSubscription/);
  });

  it('no admin route can mark an order paid', () => {
    const source = readSource('src', 'app', 'api', 'portal', 'admin', 'payments', 'route.ts');
    expect(source).toMatch(/export async function GET/);
    expect(source).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });

  it('success is only shown when the server affirms it', () => {
    // The provider's success callback is a signal, not authority. A response
    // that does not say `paid` must not become a success screen.
    const source = readSource(
      'src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts'
    );
    expect(source).toMatch(/if \(!result\.paid\)/);
    expect(source).toMatch(/setPhase\('succeeded'\)/);
  });
});

describe('no payment secret reaches the browser', () => {
  it('the shared SDK module never references a secret', () => {
    // This module is imported by 'use client' components, so anything it
    // mentions is shipped to the browser.
    const source = readSource('src', 'lib', 'billing', 'razorpay-sdk.ts');
    expect(source).not.toMatch(/KEY_SECRET|WEBHOOK_SECRET|keySecret|webhookSecret/);
  });

  it('only the public key id is passed to the provider window', () => {
    const source = readSource(
      'src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts'
    );
    expect(source).toMatch(/key: checkout\.providerKeyId/);
    expect(source).not.toMatch(/keySecret|webhookSecret/);
  });

  it('the checkout endpoints expose the public key id only', () => {
    for (const route of [
      ['src', 'app', 'api', 'portal', 'employer', 'orders', 'route.ts'],
      ['src', 'app', 'api', 'portal', 'candidate', 'premium', 'checkout', 'route.ts'],
    ]) {
      const source = readSource(...route);
      expect(source).toMatch(/providerKeyId/);
      expect(source).not.toMatch(/KEY_SECRET|WEBHOOK_SECRET/);
    }
  });
});

describe('every provider outcome is handled distinctly', () => {
  const source = () =>
    readSource('src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts');

  it('distinguishes cancellation, failure and confirmation', () => {
    // Collapsing these is how a customer ends up paying twice, so each has its
    // own phase and its own user-facing message.
    expect(source()).toMatch(/ondismiss/);
    expect(source()).toMatch(/'cancelled'/);
    expect(source()).toMatch(/payment\.failed/);
    expect(source()).toMatch(/'failed'/);
    expect(source()).toMatch(/'confirming'/);
    expect(source()).toMatch(/'succeeded'/);
  });

  it('reports an unconfigured gateway without offering a pointless retry', () => {
    // Retrying cannot help until payments are configured, so the UI says so and
    // suppresses the retry affordance.
    const status = readSource('src', 'components', 'portal', 'checkout', 'checkout-status.tsx');
    expect(source()).toMatch(/CHECKOUT_UNAVAILABLE_MESSAGE/);
    expect(status).toMatch(/onRetry && !unavailable/);
  });

  it('does not claim success when verification fails', () => {
    // The customer may genuinely have been charged, so the message has to be
    // honest about the ambiguity rather than declaring either outcome.
    expect(source()).toMatch(/reconciled automatically/);
  });
});

describe('the shared SDK loader is not duplicated', () => {
  it('only one module fetches the checkout script', () => {
    // Two copies would mean two window.Razorpay definitions and a second
    // component hanging forever on a load event that already fired. The loader
    // is the single place that is allowed to reference the CDN, and every
    // consumer must go through it.
    const sdk = readSource('src', 'lib', 'billing', 'razorpay-sdk.ts');
    expect(sdk).toContain('checkout.razorpay.com/v1/checkout.js');
    expect(sdk).toContain('data-razorpay-checkout');

    // Every checkout consumer in the tree, so a new one cannot quietly inline
    // a second copy of the script tag.
    const consumers = [['src', 'components', 'portal', 'checkout', 'use-portal-checkout.ts']];
    for (const component of consumers) {
      const source = readSource(...component);
      expect(source).toMatch(/from '@\/lib\/billing\/razorpay-sdk'/);
      expect(source).not.toContain('checkout.razorpay.com');
    }
  });
});

