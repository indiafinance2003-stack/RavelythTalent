import { describe, expect, it } from "vitest";
import { composeEmail } from "../layout";
import {
  accountPendingVerificationEmail,
  emailVerificationEmail,
  emailVerificationResentEmail,
  newLoginAlertEmail,
  passwordChangedEmail,
  passwordResetEmail,
  securityAlertEmail,
} from "./auth";
import {
  invoiceDeliveryEmail,
  paymentFailedEmail,
  paymentSuccessEmail,
  subscriptionActivatedEmail,
  subscriptionExpiredEmail,
  subscriptionExpiringSoonEmail,
  subscriptionRenewedEmail,
} from "./billing";
import { contactInquiryEmail } from "./contact";
import {
  applicationStatusChangeEmail,
  applicationSubmittedEmail,
  interviewScheduledEmail,
  jobAlertEmail,
} from "./product";
import {
  addonPurchaseEmail,
  applicationReceivedEmail,
  candidateShortlistedEmail,
  companyRestoredEmail,
  companySuspendedEmail,
  companyVerificationApprovedEmail,
  companyVerificationRejectedEmail,
  companyVerificationSubmittedEmail,
  freeJobCreditLimitReachedEmail,
  freeJobCreditWarningEmail,
  jobApprovedEmail,
  jobPostLimitReachedEmail,
  jobPostLimitWarningEmail,
  jobRejectedEmail,
  teamInvitationEmail,
} from "./recruiter";

const templates = [
  ["account pending verification", () => accountPendingVerificationEmail({ name: "Test" })],
  ["email verification", () => emailVerificationEmail({ name: "Test", url: "https://example.test/verify" })],
  ["verification resend", () => emailVerificationResentEmail({ name: "Test", url: "https://example.test/verify" })],
  ["new login alert", () => newLoginAlertEmail({ name: "Test", at: "2026-01-01", ip: null, device: null })],
  ["password changed", () => passwordChangedEmail({ name: "Test", at: "2026-01-01", ip: null })],
  ["password reset", () => passwordResetEmail({ name: "Test", url: "https://example.test/reset" })],
  ["security alert", () => securityAlertEmail({ name: "Test", title: "Security event", details: [{ label: "Device", value: "Test browser" }] })],
  ["invoice delivery", () => invoiceDeliveryEmail({ name: "Test", invoiceNumber: "RAV/2026-27/000001", planName: "Professional", amount: "₹1,000", issuedOn: "2026-01-01", downloadUrl: "https://example.test/invoice" })],
  ["payment failed", () => paymentFailedEmail({ name: "Test", planName: "Professional", amount: "₹1,000", retryUrl: "https://example.test/retry" })],
  ["payment success", () => paymentSuccessEmail({ name: "Test", planName: "Professional", amount: "₹1,000", orderId: "order_test" })],
  ["subscription activated", () => subscriptionActivatedEmail({ name: "Test", planName: "Professional", periodLabel: "1 month", endsOn: "2026-02-01", manageUrl: "https://example.test/billing" })],
  ["subscription expired", () => subscriptionExpiredEmail({ name: "Test", planName: "Professional", endedOn: "2026-01-01", renewUrl: "https://example.test/renew" })],
  ["subscription expiry reminder", () => subscriptionExpiringSoonEmail({ name: "Test", planName: "Professional", daysLeft: 3, endsOn: "2026-02-01", renewUrl: "https://example.test/renew" })],
  ["subscription renewed", () => subscriptionRenewedEmail({ name: "Test", planName: "Professional", periodLabel: "1 month", endsOn: "2026-02-01", manageUrl: "https://example.test/billing" })],
  ["contact inquiry", () => contactInquiryEmail({ name: "Test", email: "test@example.com", message: "A test message." })],
  ["application received", () => applicationReceivedEmail({ recruiterName: "Recruiter", candidateName: "Candidate", jobTitle: "Engineer", candidateUrl: "https://example.test/applicant" })],
  ["application status change", () => applicationStatusChangeEmail({ candidateName: "Candidate", jobTitle: "Engineer", companyName: "Example", statusLabel: "shortlisted", jobUrl: "https://example.test/job" })],
  ["application submitted", () => applicationSubmittedEmail({ candidateName: "Candidate", jobTitle: "Engineer", companyName: "Example", jobUrl: "https://example.test/job" })],
  ["interview scheduled", () => interviewScheduledEmail({ candidateName: "Candidate", jobTitle: "Engineer", companyName: "Example", mode: "video", scheduledAt: "2026-01-01 10:00", confirmUrl: "https://example.test/confirm" })],
  ["job alert", () => jobAlertEmail({ candidateName: "Candidate", alertName: "Engineer", frequency: "daily", jobs: [], searchUrl: "https://example.test/jobs", manageUrl: "https://example.test/alerts", unsubscribeUrl: "https://example.test/unsubscribe" })],
  ["add-on purchase", () => addonPurchaseEmail({ ownerName: "Owner", addonName: "Featured job", amount: "₹500" })],
  ["candidate shortlisted", () => candidateShortlistedEmail({ recruiterName: "Recruiter", candidateName: "Candidate", jobTitle: "Engineer", candidateUrl: "https://example.test/applicant" })],
  ["company restored", () => companyRestoredEmail({ ownerName: "Owner", companyName: "Example" })],
  ["company suspended", () => companySuspendedEmail({ ownerName: "Owner", companyName: "Example", reason: "Review required" })],
  ["company verification approved", () => companyVerificationApprovedEmail({ ownerName: "Owner", companyName: "Example" })],
  ["company verification rejected", () => companyVerificationRejectedEmail({ ownerName: "Owner", companyName: "Example", reason: "Please update the document", brand: undefined })],
  ["company verification submitted", () => companyVerificationSubmittedEmail({ ownerName: "Owner", companyName: "Example" })],
  ["job approved", () => jobApprovedEmail({ recruiterName: "Recruiter", jobTitle: "Engineer", jobUrl: "https://example.test/job" })],
  ["job post limit reached", () => jobPostLimitReachedEmail({ companyName: "Example", limit: 5, periodLabel: "January", upgradeUrl: "https://example.test/pricing" })],
  ["job post limit warning", () => jobPostLimitWarningEmail({ companyName: "Example", used: 4, limit: 5, periodLabel: "January" })],
  ["free job credit warning", () => freeJobCreditWarningEmail({ companyName: "Example", used: 1, limit: 1, upgradeUrl: "https://example.test/pricing" })],
  ["free job credit limit reached", () => freeJobCreditLimitReachedEmail({ companyName: "Example", limit: 1, upgradeUrl: "https://example.test/pricing" })],
  ["job rejected", () => jobRejectedEmail({ recruiterName: "Recruiter", jobTitle: "Engineer", reason: "Needs details", editUrl: "https://example.test/edit" })],
  ["team invitation", () => teamInvitationEmail({ companyName: "Example", role: "recruiter", inviteUrl: "https://example.test/invite" })],
] as const;

describe("transactional email templates", () => {
  it.each(templates)("%s renders both HTML and plain text", (_name, render) => {
    const email = render();
    expect(email.subject.trim()).not.toBe("");
    expect(email.html).toContain("<!doctype html>");
    expect(email.text.trim()).not.toBe("");
  });

  it("uses an absolute logo URL in email HTML when an owner supplies a logo", () => {
    const email = composeEmail({
      subject: "Logo check",
      heading: "Logo check",
      brand: {
        brandName: "Ravelyth Talent",
        logoUrl: "https://ravelyth.in/logo.svg",
      },
    });
    expect(email.html).toContain('src="https://ravelyth.in/logo.svg"');
    expect(email.html).toContain('alt="Ravelyth Talent"');
  });

  it("renders a single text wordmark when no logo URL is configured", () => {
    const email = composeEmail({ subject: "Wordmark check", heading: "Wordmark check" });
    expect(email.html).toContain("Ravelyth");
    expect(email.html).toContain("Talent</span>");
    expect(email.html).not.toContain("Talent Talent");
  });
});
