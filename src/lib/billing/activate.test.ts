import { describe, expect, it } from "vitest";
import { periodEndFor } from "./activate";

describe("subscription period boundaries", () => {
  it("clamps monthly periods to the last day instead of overflowing", () => {
    expect(periodEndFor(new Date("2025-01-31T10:00:00.000Z"), "monthly"))
      .toEqual(new Date("2025-02-28T10:00:00.000Z"));
  });

  it("clamps leap-day annual subscriptions in non-leap years", () => {
    expect(periodEndFor(new Date("2024-02-29T10:00:00.000Z"), "yearly"))
      .toEqual(new Date("2025-02-28T10:00:00.000Z"));
  });
});
