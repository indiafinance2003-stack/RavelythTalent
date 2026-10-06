export type UserDeletionPolicyInput = {
  actorUserId: string;
  targetUserId: string;
  targetRole: string;
  hasPaidPayment: boolean;
  hasInvoice: boolean;
};

export function userDeletionBlockReason(
  input: UserDeletionPolicyInput,
): string | null {
  if (input.actorUserId === input.targetUserId) {
    return "You cannot delete your own account.";
  }
  if (input.targetRole === "admin") {
    return "Administrator accounts cannot be deleted.";
  }
  if (input.hasPaidPayment || input.hasInvoice) {
    return "This account has a paid payment or invoice. Suspend the account instead.";
  }
  return null;
}

export function shouldDeleteOwnedCompany(otherActiveMemberCount: number): boolean {
  return otherActiveMemberCount === 0;
}
