import 'server-only';
import {
  actionBlock,
  greeting,
  layout,
  note,
  paragraph,
  resolveBrand,
  spacer,
  type EmailContent,
  type TemplateContext,
} from './layout';

/**
 * Ravelyth Talent transactional email templates.
 *
 * Each template is a pure function of its input, so content can be unit tested
 * without a provider. No template ever renders a token value, a password, or a
 * payment credential — only server-generated links.
 */

export interface PasswordResetEmailInput {
  recipientName: string;
  resetUrl: string;
  expiresInMinutes: number;
  context?: TemplateContext;
}

/** Password reset. Displays the link only, never the token itself. */
export function renderPasswordResetEmail(input: PasswordResetEmailInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Reset your ${brand} password`;
  const text = [
    `Hi ${input.recipientName || 'there'},`,
    '',
    `We received a request to reset the password for your ${brand} account.`,
    'Use the link below to choose a new password:',
    '',
    input.resetUrl,
    '',
    `This link will expire in ${input.expiresInMinutes} minutes.`,
    'If you did not ask to reset your password, you can safely ignore this email — your password will not change.',
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.recipientName),
    spacer(12),
    paragraph(`We received a request to reset the password for your ${brand} account.`),
    spacer(20),
    actionBlock('Reset your password', input.resetUrl),
    note(
      `This link will expire in ${input.expiresInMinutes} minutes. If you did not request this, you can safely ignore this email — your password will not change.`
    ),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface EmailVerificationInput {
  recipientName: string;
  verificationUrl: string;
  expiresInHours: number;
  context?: TemplateContext;
}

/** Sent immediately after registration; activates the account. */
export function renderEmailVerificationEmail(input: EmailVerificationInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Verify your ${brand} email address`;
  const text = [
    `Hi ${input.recipientName || 'there'},`,
    '',
    `Welcome to ${brand}. Please confirm your email address to activate your account.`,
    '',
    input.verificationUrl,
    '',
    `This link will expire in ${input.expiresInHours} hours.`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.recipientName),
    spacer(12),
    paragraph(`Welcome to ${brand}. Please confirm your email address to activate your account.`),
    spacer(20),
    actionBlock('Verify my email', input.verificationUrl),
    note(
      `This link will expire in ${input.expiresInHours} hours. If you did not create this account, you can safely ignore this email.`
    ),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface PasswordChangedInput {
  recipientName: string;
  changedAtIso: string;
  context?: TemplateContext;
}

/** Security notification sent after a successful password change/reset. */
export function renderPasswordChangedEmail(input: PasswordChangedInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Your ${brand} password was changed`;
  const text = [
    `Hi ${input.recipientName || 'there'},`,
    '',
    `The password for your ${brand} account was changed.`,
    `Changed at: ${input.changedAtIso}`,
    '',
    'All other sessions were signed out as a precaution.',
    'If you did not make this change, contact support immediately.',
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.recipientName),
    spacer(12),
    paragraph(`The password for your ${brand} account was changed.`),
    note(`Changed at: ${input.changedAtIso}`),
    spacer(12),
    note(
      'All other sessions were signed out as a precaution. If you did not make this change, contact support immediately.'
    ),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface ApplicationSubmittedInput {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  context?: TemplateContext;
}

/** Confirmation to the candidate that their application was received. */
export function renderApplicationSubmittedEmail(input: ApplicationSubmittedInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Application received: ${input.jobTitle}`;
  const text = [
    `Hi ${input.candidateName || 'there'},`,
    '',
    `Your application for ${input.jobTitle} at ${input.companyName} has been submitted successfully.`,
    '',
    `You can track its status from your ${brand} dashboard.`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.candidateName),
    spacer(12),
    paragraph(
      `Your application for ${input.jobTitle} at ${input.companyName} has been submitted successfully.`
    ),
    spacer(12),
    note(`You can track its status from your ${brand} dashboard.`),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface NewApplicationInput {
  employerName: string;
  candidateName: string;
  jobTitle: string;
  dashboardPath: string;
  context?: TemplateContext;
}

/** Alert to an employer that a new application arrived. */
export function renderNewApplicationEmail(input: NewApplicationInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `New application for ${input.jobTitle}`;
  const text = [
    `Hi ${input.employerName || 'there'},`,
    '',
    `${input.candidateName} has applied for ${input.jobTitle}.`,
    '',
    `Review it here: ${input.dashboardPath}`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.employerName),
    spacer(12),
    paragraph(`${input.candidateName} has applied for ${input.jobTitle}.`),
    spacer(20),
    actionBlock('Review application', input.dashboardPath),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface ApplicationStatusChangedInput {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  statusLabel: string;
  context?: TemplateContext;
}

/** Tells a candidate that an application moved to a new stage. */
export function renderApplicationStatusChangedEmail(
  input: ApplicationStatusChangedInput
): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Application update: ${input.jobTitle}`;
  const text = [
    `Hi ${input.candidateName || 'there'},`,
    '',
    `Your application for ${input.jobTitle} at ${input.companyName} is now: ${input.statusLabel}.`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.candidateName),
    spacer(12),
    paragraph(
      `Your application for ${input.jobTitle} at ${input.companyName} is now: ${input.statusLabel}.`
    ),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface JobDecisionInput {
  employerName: string;
  jobTitle: string;
  /** Present only for a rejection; always admin-authored text, never a raw enum. */
  rejectionReason?: string | null;
  dashboardPath: string;
  context?: TemplateContext;
}

/** Sent when an admin approves a job posting. */
export function renderJobApprovedEmail(input: JobDecisionInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Your job posting is live: ${input.jobTitle}`;
  const text = [
    `Hi ${input.employerName || 'there'},`,
    '',
    `${input.jobTitle} has been approved and is now visible on ${brand}.`,
    '',
    `Manage it here: ${input.dashboardPath}`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.employerName),
    spacer(12),
    paragraph(`${input.jobTitle} has been approved and is now visible on ${brand}.`),
    spacer(20),
    actionBlock('View job posting', input.dashboardPath),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

/** Sent when an admin rejects a job posting, including the stated reason. */
export function renderJobRejectedEmail(input: JobDecisionInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Job posting needs changes: ${input.jobTitle}`;
  const reason =
    input.rejectionReason && input.rejectionReason.trim().length > 0
      ? input.rejectionReason.trim()
      : 'Please review the posting and submit it again.';
  const text = [
    `Hi ${input.employerName || 'there'},`,
    '',
    `${input.jobTitle} was not approved.`,
    '',
    `Reason: ${reason}`,
    '',
    `Update and resubmit here: ${input.dashboardPath}`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.employerName),
    spacer(12),
    paragraph(`${input.jobTitle} was not approved.`),
    note(`Reason: ${reason}`),
    spacer(20),
    actionBlock('Update posting', input.dashboardPath),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface JobExpiringInput {
  employerName: string;
  jobTitle: string;
  expiresAtIso: string;
  dashboardPath: string;
  context?: TemplateContext;
}

/** Reminder that a posting will stop accepting applications. */
export function renderJobExpiringEmail(input: JobExpiringInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Job posting expiring soon: ${input.jobTitle}`;
  const text = [
    `Hi ${input.employerName || 'there'},`,
    '',
    `${input.jobTitle} stops accepting applications on ${input.expiresAtIso}.`,
    '',
    `Extend or close it here: ${input.dashboardPath}`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.employerName),
    spacer(12),
    paragraph(`${input.jobTitle} stops accepting applications on ${input.expiresAtIso}.`),
    spacer(20),
    actionBlock('Manage posting', input.dashboardPath),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface PaymentConfirmationInput {
  recipientName: string;
  orderNumber: string;
  amountLabel: string;
  creditsLabel?: string | null;
  context?: TemplateContext;
}

/** Receipt for a verified payment. Only ever sent after server verification. */
export function renderPaymentConfirmationEmail(input: PaymentConfirmationInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Payment received: ${input.orderNumber}`;
  const credits = input.creditsLabel
    ? `\n${input.creditsLabel} have been added to your account.`
    : '';
  const text = [
    `Hi ${input.recipientName || 'there'},`,
    '',
    `We received your payment of ${input.amountLabel} for order ${input.orderNumber}.${credits}`,
    '',
    `Thank you for using ${brand}.`,
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.recipientName),
    spacer(12),
    paragraph(`We received your payment of ${input.amountLabel} for order ${input.orderNumber}.`),
    input.creditsLabel ? note(input.creditsLabel) : '',
    spacer(12),
    note(`Thank you for using ${brand}.`),
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, text, html: layout(brand, rows) };
}

export interface SecurityAlertInput {
  recipientName: string;
  eventDescription: string;
  occurredAtIso: string;
  context?: TemplateContext;
}

/** Generic security notification (suspension, new device sign-in, etc.). */
export function renderSecurityAlertEmail(input: SecurityAlertInput): EmailContent {
  const brand = resolveBrand(input.context);
  const subject = `Security notice for your ${brand} account`;
  const text = [
    `Hi ${input.recipientName || 'there'},`,
    '',
    `Security activity on your account at ${input.occurredAtIso}:`,
    input.eventDescription,
    '',
    'If this was not you, please contact support immediately.',
    '',
    `— The ${brand} team`,
  ].join('\n');

  const rows = [
    greeting(input.recipientName),
    spacer(12),
    paragraph(`Security activity on your account at ${input.occurredAtIso}:`),
    note(input.eventDescription),
    spacer(12),
    note('If this was not you, please contact support immediately.'),
  ].join('\n');

  return { subject, text, html: layout(brand, rows) };
}
