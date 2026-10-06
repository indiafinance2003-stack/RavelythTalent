export type PasswordResetAccountState = {
  role: "job_seeker" | "recruiter" | "admin";
  status: "active" | "suspended" | "deactivated";
  emailVerifiedAt: Date | null;
  deletedAt: Date | null;
};

export function normalizePasswordResetEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function passwordResetSuppressionReason(
  account: PasswordResetAccountState | null,
): string | null {
  if (!account) return "Suppressed: no matching account exists.";
  if (account.deletedAt) return "Suppressed: account is deleted.";
  if (account.status !== "active") {
    return `Suppressed: account is ${account.status}.`;
  }
  if (!account.emailVerifiedAt) {
    return "Suppressed: account email is not verified.";
  }
  return null;
}
