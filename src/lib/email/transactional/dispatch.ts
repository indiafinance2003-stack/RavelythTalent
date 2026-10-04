import 'server-only';
import { config } from '@/lib/config';
import { logger } from '@/lib/logging/logger';
import { dbFromRequest } from '@/lib/db/request';
import { emailEvents } from '@/lib/db/portal-schema';
import { emailProviderStatus, getEmailProvider } from './provider';
import {
  renderApplicationStatusChangedEmail,
  renderApplicationSubmittedEmail,
  renderEmailVerificationEmail,
  renderInvoiceIssuedEmail,
  renderJobApprovedEmail,
  renderJobExpiringEmail,
  renderJobRejectedEmail,
  renderNewApplicationEmail,
  renderPasswordChangedEmail,
  renderPaymentConfirmationEmail,
  renderSecurityAlertEmail,
} from './portal-templates';
import type { EmailContent } from './layout';
import type { EmailProvider } from './types';

/**
 * Ravelyth Talent email dispatcher.
 *
 * Every portal email goes through `dispatchEmail`, so provider selection,
 * credential handling and failure reporting are uniform. No caller ever
 * composes or sends mail directly.
 */

export class EmailDeliveryUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'EmailDeliveryUnavailableError';
  }
}

/** Sanitized, credential-free reason suitable for logs. */
export function describeEmailDeliveryIssue(error: unknown): string {
  if (error instanceof EmailDeliveryUnavailableError) return error.message;
  return 'the transactional email provider reported an error';
}

export interface EmailSendResult {
  delivered: boolean;
  /** Sanitized reason when delivery did not happen. Never contains secrets. */
  reason?: string;
}

export interface SendOptions {
  /**
   * Injectable provider used only by unit tests. It can never be supplied by
   * request data, so mail cannot be redirected through an attacker transport.
   */
  provider?: EmailProvider;
}

interface DispatchInput {
  to: string;
  content: EmailContent;
  /** Logical event name for operational logs (never an address). */
  event: string;
}

/**
 * Records the attempt in `email_events`, the operational ledger an operator
 * reads to answer "did the customer ever receive this?".
 *
 * Best-effort by design: a failure to record must never block or fail the mail
 * itself, and unit tests (which inject a provider and may have no database)
 * simply skip it. No subject, body or token is ever stored here — only the
 * event, the recipient, the status and a sanitized reason.
 */
async function logEmailEvent(input: {
  event: string;
  to: string;
  status: 'sent' | 'failed' | 'skipped';
  reason?: string | null;
}): Promise<void> {
  try {
    const { db } = dbFromRequest();
    const now = new Date();
    await db.insert(emailEvents).values({
      event: input.event,
      template: input.event,
      recipientEmail: input.to,
      status: input.status,
      reason: input.reason ?? null,
      sentAt: input.status === 'sent' ? now : null,
      metadata: {},
    });
  } catch {
    // The log is secondary to the delivery it describes.
  }
}

async function dispatchEmail(input: DispatchInput, options: SendOptions): Promise<EmailSendResult> {
  const provider = options.provider ?? getEmailProvider();
  // An injected provider is a TEST transport: its attempts are asserted by the
  // tests themselves and are never written to the operational ledger.
  const logAttempts = options.provider === undefined;
  if (!provider) {
    const status = emailProviderStatus();
    const reason = status.unsupported
      ? 'EMAIL_PROVIDER is set to an unsupported provider.'
      : 'EMAIL_PROVIDER is not configured.';
    // 'skipped' is exactly the state an operator must be able to see rather
    // than discovering that nobody ever received a password reset.
    if (logAttempts) {
      await logEmailEvent({ event: input.event, to: input.to, status: 'skipped', reason });
    }
    return { delivered: false, reason };
  }

  try {
    await provider.send({
      from: config.EMAIL_FROM,
      to: input.to,
      subject: input.content.subject,
      text: input.content.text,
      html: input.content.html,
    });
    logger.info('Transactional email delivered', { event: input.event });
    if (logAttempts) {
      await logEmailEvent({ event: input.event, to: input.to, status: 'sent' });
    }
    return { delivered: true };
  } catch (error) {
    // Sanitized: never the address, the content, or any token.
    const reason = describeEmailDeliveryIssue(error);
    logger.error('Transactional email delivery failed', {
      event: input.event,
      reason,
    });
    if (logAttempts) {
      await logEmailEvent({ event: input.event, to: input.to, status: 'failed', reason });
    }
    return { delivered: false, reason };
  }
}

export function sendEmailVerification(input: {
  to: string;
  recipientName: string;
  verificationUrl: string;
  expiresInHours: number;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    {
      to: input.to,
      event: 'email_verification',
      content: renderEmailVerificationEmail({
        recipientName: input.recipientName,
        verificationUrl: input.verificationUrl,
        expiresInHours: input.expiresInHours,
      }),
    },
    options
  );
}

export function sendPasswordChanged(input: {
  to: string;
  recipientName: string;
  changedAtIso: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    {
      to: input.to,
      event: 'password_changed',
      content: renderPasswordChangedEmail(input),
    },
    options
  );
}

export function sendApplicationSubmitted(input: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    {
      to: input.to,
      event: 'application_submitted',
      content: renderApplicationSubmittedEmail(input),
    },
    options
  );
}

export function sendNewApplication(input: {
  to: string;
  employerName: string;
  candidateName: string;
  jobTitle: string;
  dashboardPath: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'new_application_received', content: renderNewApplicationEmail(input) },
    options
  );
}

export function sendApplicationStatusChanged(input: {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  statusLabel: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    {
      to: input.to,
      event: 'application_status_changed',
      content: renderApplicationStatusChangedEmail(input),
    },
    options
  );
}


export function sendJobApproved(input: {
  to: string;
  employerName: string;
  jobTitle: string;
  dashboardPath: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'job_approved', content: renderJobApprovedEmail(input) },
    options
  );
}

export function sendJobRejected(input: {
  to: string;
  employerName: string;
  jobTitle: string;
  rejectionReason?: string | null;
  dashboardPath: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'job_rejected', content: renderJobRejectedEmail(input) },
    options
  );
}

export function sendJobExpiring(input: {
  to: string;
  employerName: string;
  jobTitle: string;
  expiresAtIso: string;
  dashboardPath: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'job_expiring', content: renderJobExpiringEmail(input) },
    options
  );
}

export function sendPaymentConfirmation(input: {
  to: string;
  recipientName: string;
  orderNumber: string;
  amountLabel: string;
  creditsLabel?: string | null;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'package_purchased', content: renderPaymentConfirmationEmail(input) },
    options
  );
}

export function sendSecurityAlert(input: {
  to: string;
  recipientName: string;
  eventDescription: string;
  occurredAtIso: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'security_alert', content: renderSecurityAlertEmail(input) },
    options
  );
}

/**
 * Sends the tax invoice for an order.
 *
 * Called only from the payment-confirmation path, AFTER the invoice row has
 * committed. The amounts are the values snapshotted on that row rather than
 * anything recomputed from the order, so the email and the document can never
 * disagree.
 *
 * Delivery is best-effort by design: a mail failure must not roll back a payment
 * that already settled, so the caller records `emailedAt` from the RESULT rather
 * than assuming the send worked.
 */
export function sendInvoiceIssued(input: {
  to: string;
  recipientName: string;
  invoiceNumber: string;
  description: string;
  subtotalLabel: string;
  taxLabel: string;
  totalLabel: string;
  dashboardPath: string;
}, options: SendOptions = {}): Promise<EmailSendResult> {
  return dispatchEmail(
    { to: input.to, event: 'invoice_issued', content: renderInvoiceIssuedEmail(input) },
    options
  );
}

