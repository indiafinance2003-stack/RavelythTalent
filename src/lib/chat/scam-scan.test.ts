import { describe, expect, it } from "vitest";
import { chatMessageFlagsPayment, containsPaymentRequest } from "./scam-scan";

describe("chat scam scan", () => {
  it("flags payment requests", () => {
    expect(containsPaymentRequest("Please pay a registration fee to start.")).toBe(
      true,
    );
    expect(containsPaymentRequest("You must pay a security deposit first")).toBe(
      true,
    );
    expect(containsPaymentRequest("We need an upfront payment")).toBe(true);
  });

  it("does not flag ordinary messages", () => {
    expect(
      containsPaymentRequest("Thanks for applying, we will call you tomorrow."),
    ).toBe(false);
  });

  it("exposes the flag through chatMessageFlagsPayment", () => {
    expect(chatMessageFlagsPayment("send money now")).toBe(true);
    expect(chatMessageFlagsPayment("looking forward to the interview")).toBe(
      false,
    );
  });
});
