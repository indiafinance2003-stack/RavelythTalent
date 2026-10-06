import { beforeEach, describe, expect, it, vi } from "vitest";

const { activateSubscription } = vi.hoisted(() => ({
  activateSubscription: vi.fn(),
}));

vi.mock("@/lib/billing/activate", () => ({ activateSubscription }));

import { activateSubscriptionFromPayment } from "./payment-activation";

describe("verified payment activation ownership", () => {
  beforeEach(() => {
    activateSubscription.mockResolvedValue({
      alreadyProcessed: false,
      subscriptionId: "subscription-1",
      invoiceId: "invoice-1",
    });
  });

  it.each([
    { userId: "candidate-user", companyId: null, planId: "candidate-plan" },
    { userId: "recruiter-user", companyId: "company-1", planId: "employer-plan" },
  ])("passes the $planId owner through to subscription activation", async (owner) => {
    await activateSubscriptionFromPayment({
      orderId: "order-1",
      paymentId: "payment-1",
      amountPaise: 49900,
      ...owner,
      billingPeriod: "monthly",
    });

    expect(activateSubscription).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentId: "payment-1",
      amountPaise: 49900,
      ...owner,
      billingPeriod: "monthly",
      signatureVerified: true,
    });
  });
});
