import { describe, expect, it } from "vitest";
import {
  normalizePasswordResetEmail,
  passwordResetSuppressionReason,
} from "./password-reset-policy";

const verified = {
  role: "job_seeker" as const,
  status: "active" as const,
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
};

describe("password reset eligibility", () => {
  it.each(
    (["job_seeker", "recruiter", "admin"] as const).flatMap((role) =>
      (["active", "suspended", "deactivated"] as const).map((status) =>
        [role, status] as const,
      ),
    ),
  )("checks %s accounts in %s status", (role, status) => {
    const reason = passwordResetSuppressionReason({
      ...verified,
      role,
      status,
    });
    expect(reason).toBe(
      status === "active" ? null : `Suppressed: account is ${status}.`,
    );
  });

  it("suppresses unverified and soft-deleted accounts", () => {
    expect(
      passwordResetSuppressionReason({ ...verified, emailVerifiedAt: null }),
    ).toBe("Suppressed: account email is not verified.");
    expect(
      passwordResetSuppressionReason({
        ...verified,
        deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe("Suppressed: account is deleted.");
  });

  it("records an explicit reason when the address has no account", () => {
    expect(passwordResetSuppressionReason(null)).toBe(
      "Suppressed: no matching account exists.",
    );
  });

  it("normalizes the lookup address case-insensitively", () => {
    expect(normalizePasswordResetEmail("  Recruiter@Example.COM ")).toBe(
      "recruiter@example.com",
    );
  });
});
