import { describe, expect, it } from "vitest";
import {
  codeChallengeS256,
  constantTimeEqual,
  generateOtp,
  generateToken,
  sha256Hex,
} from "./crypto";

describe("authentication cryptography helpers", () => {
  it("creates URL-safe opaque tokens and stable SHA-256 hashes", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(generateToken());
    expect(sha256Hex("value")).toBe(sha256Hex("value"));
    expect(sha256Hex("value")).not.toBe("value");
  });

  it("compares equal and unequal secrets including mismatched lengths", () => {
    expect(constantTimeEqual("same-secret", "same-secret")).toBe(true);
    expect(constantTimeEqual("same-secret", "other-secret")).toBe(false);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });

  it("generates correctly shaped OTPs and PKCE challenges", () => {
    expect(generateOtp(6)).toMatch(/^\d{6}$/);
    expect(codeChallengeS256("verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
