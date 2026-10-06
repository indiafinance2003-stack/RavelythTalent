import { describe, expect, it } from "vitest";
import {
  assertOfflinePlanOwner,
  paidPriceForPeriod,
} from "./offline-subscription-validation";

describe("offline subscription billing period validation", () => {
  const plan = { priceMonthlyPaise: 49900, priceYearlyPaise: 299900 };

  it("accepts active plans only when the audience matches the owner", () => {
    expect(() => assertOfflinePlanOwner(
      { audience: "candidate", isActive: true },
      "candidate",
    )).not.toThrow();
    expect(() => assertOfflinePlanOwner(
      { audience: "employer", isActive: true },
      "candidate",
    )).toThrow("Choose an active plan that matches the subscription owner.");
  });

  it("uses the selected period's plan price", () => {
    expect(paidPriceForPeriod(plan, "monthly")).toBe(49900);
    expect(paidPriceForPeriod(plan, "yearly")).toBe(299900);
  });

  it("rejects a period with no billable price", () => {
    expect(() => paidPriceForPeriod(
      { priceMonthlyPaise: 49900, priceYearlyPaise: 0 },
      "yearly",
    )).toThrow("The selected plan does not have a paid yearly price.");
  });
});
