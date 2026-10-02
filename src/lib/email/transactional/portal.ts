/**
 * Public surface for Ravelyth Talent email content and sending.
 *
 * Templates are pure functions (see `portal-templates.ts`) so their output can
 * be unit tested without a provider. No template ever renders a token value, a
 * password, or a payment credential — only server-generated links.
 *
 * Sending goes through `dispatch.ts`; this module only re-exports the renderers
 * and shared types so callers have a single import.
 */

// Template renderers, re-exported for callers and tests.
export {
  renderApplicationStatusChangedEmail,
  renderApplicationSubmittedEmail,
  renderEmailVerificationEmail,
  renderJobApprovedEmail,
  renderJobExpiringEmail,
  renderJobRejectedEmail,
  renderNewApplicationEmail,
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
  renderPaymentConfirmationEmail,
  renderSecurityAlertEmail,
} from './portal-templates';

// Layout primitives and shared types.
export { DEFAULT_BRAND, escapeHtmlText } from './layout';
export type { EmailContent, TemplateContext } from './layout';
export type { EmailProvider } from './types';

// Template input contracts.
export type {
  ApplicationStatusChangedInput,
  ApplicationSubmittedInput,
  EmailVerificationInput,
  JobDecisionInput,
  JobExpiringInput,
  NewApplicationInput,
  PasswordChangedInput,
  PasswordResetEmailInput,
  PaymentConfirmationInput,
  SecurityAlertInput,
} from './portal-templates';

// The dispatcher used by services (never call a provider directly).
export {
  describeEmailDeliveryIssue,
  EmailDeliveryUnavailableError,
  sendApplicationStatusChanged,
  sendApplicationSubmitted,
  sendEmailVerification,
  sendJobApproved,
  sendJobExpiring,
  sendJobRejected,
  sendNewApplication,
  sendPasswordChanged,
  sendPaymentConfirmation,
  sendSecurityAlert,
} from './dispatch';
export type { EmailSendResult, SendOptions } from './dispatch';

// Provider status, used by health/admin surfaces to report delivery honestly.
export { emailProviderStatus } from './provider';
export type { EmailProviderStatus } from './provider';
