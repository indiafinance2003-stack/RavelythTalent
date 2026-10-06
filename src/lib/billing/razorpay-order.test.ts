import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("razorpay", () => ({
  default: class RazorpayMock {
    orders = { create: sdk.create };
  },
}));

import { createRazorpayOrder } from "./razorpay";

describe("Razorpay subscription order creation", () => {
  beforeEach(() => {
    sdk.create.mockResolvedValue({
      id: "order_mock",
      amount: 49900,
      currency: "INR",
    });
  });

  it.each([
    { userId: "candidate-user", companyId: "" },
    { userId: "recruiter-user", companyId: "company-1" },
  ])("creates an INR order for $userId with its owner notes", async (owner) => {
    await createRazorpayOrder({
      amountPaise: 49900,
      receipt: "receipt-1",
      notes: { ...owner, planId: "plan-1", purpose: "subscription" },
    });

    expect(sdk.create).toHaveBeenCalledWith({
      amount: 49900,
      currency: "INR",
      receipt: "receipt-1",
      notes: { ...owner, planId: "plan-1", purpose: "subscription" },
    });
  });
});
