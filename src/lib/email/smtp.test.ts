import { describe, expect, it } from "vitest";
import { systemReplyTo } from "./smtp";

describe("systemReplyTo", () => {
  it("applies Reply-To when the sender is a noreply address", () => {
    expect(systemReplyTo("Ravelyth Talent <noreply@ravelyth.in>", "support@ravelyth.in"))
      .toBe("support@ravelyth.in");
    expect(systemReplyTo("noreply@ravelyth.in", "support@ravelyth.in"))
      .toBe("support@ravelyth.in");
  });

  it("omits Reply-To when no support address is configured", () => {
    expect(systemReplyTo("noreply@ravelyth.in", undefined)).toBeUndefined();
    expect(systemReplyTo("noreply@ravelyth.in", null)).toBeUndefined();
  });

  it("omits Reply-To for non-noreply senders", () => {
    expect(systemReplyTo("Ravelyth <hello@ravelyth.in>", "support@ravelyth.in")).toBeUndefined();
  });
});