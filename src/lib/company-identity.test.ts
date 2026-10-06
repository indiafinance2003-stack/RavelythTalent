import { describe, expect, it } from "vitest";
import {
  normalizeCompanyName,
  normalizeContactPhone,
  normalizeWebsiteDomain,
} from "./company-identity";
import { isDisposableEmail } from "./auth/disposable-email";

describe("company free-post identity", () => {
  it("normalizes names without punctuation or spacing", () => {
    expect(normalizeCompanyName("  Acme Technologies Pvt. Ltd. ")).toBe(
      "acmetechnologiespvtltd",
    );
  });

  it("normalizes websites to a lowercase non-www domain", () => {
    expect(normalizeWebsiteDomain("HTTPS://WWW.Example.com/jobs")).toBe(
      "example.com",
    );
  });

  it("normalizes contact phones to digits", () => {
    expect(normalizeContactPhone("+91 (987) 654-3210")).toBe("919876543210");
  });

  it("blocks listed disposable mailbox domains only", () => {
    expect(isDisposableEmail("owner@mailinator.com")).toBe(true);
    expect(isDisposableEmail("owner@example.com")).toBe(false);
  });
});
