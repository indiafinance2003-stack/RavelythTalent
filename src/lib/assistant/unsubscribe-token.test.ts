import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

describe("unsubscribe tokens", () => {
  it("signs and verifies the normalized address before expiry", () => {
    const token = signUnsubscribeToken("USER@EXAMPLE.COM", "test-secret", 2_000_000);
    expect(verifyUnsubscribeToken(token, "test-secret", 1_000_000)).toEqual({
      email: "user@example.com",
      expiresAt: 2000,
    });
  });

  it("rejects altered, malformed, and expired tokens", () => {
    const token = signUnsubscribeToken("user@example.com", "test-secret", 2_000_000);
    expect(verifyUnsubscribeToken(`${token}x`, "test-secret", 1_000_000)).toBeNull();
    expect(verifyUnsubscribeToken(token, "wrong-secret", 1_000_000)).toBeNull();
    expect(verifyUnsubscribeToken(token, "test-secret", 2_000_000)).toBeNull();
    expect(verifyUnsubscribeToken("junk", "test-secret")).toBeNull();
  });
});
