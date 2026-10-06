import { describe, expect, it } from "vitest";
import {
  shouldDeleteOwnedCompany,
  userDeletionBlockReason,
} from "./user-deletion-policy";

const ordinaryRequest = {
  actorUserId: "admin-id",
  targetUserId: "candidate-id",
  targetRole: "job_seeker",
  hasPaidPayment: false,
  hasInvoice: false,
};

describe("admin account deletion policy", () => {
  it("allows a non-admin account without financial records", () => {
    expect(userDeletionBlockReason(ordinaryRequest)).toBeNull();
  });

  it("refuses the logged-in admin and all administrator accounts", () => {
    expect(
      userDeletionBlockReason({
        ...ordinaryRequest,
        targetUserId: "admin-id",
      }),
    ).toBe("You cannot delete your own account.");
    expect(
      userDeletionBlockReason({ ...ordinaryRequest, targetRole: "admin" }),
    ).toBe("Administrator accounts cannot be deleted.");
  });

  it.each([
    { hasPaidPayment: true, hasInvoice: false },
    { hasPaidPayment: false, hasInvoice: true },
    { hasPaidPayment: true, hasInvoice: true },
  ])("blocks paid payment/invoice records: %o", (financialState) => {
    expect(
      userDeletionBlockReason({ ...ordinaryRequest, ...financialState }),
    ).toBe("This account has a paid payment or invoice. Suspend the account instead.");
  });

  it("deletes an owned company only when it has no other active members", () => {
    expect(shouldDeleteOwnedCompany(0)).toBe(true);
    expect(shouldDeleteOwnedCompany(1)).toBe(false);
  });
});
