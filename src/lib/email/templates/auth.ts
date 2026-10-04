import {
  composeEmail,
  type EmailBrand,
  type EmailBlock,
  type EmailOptions,
} from "../layout";
import { appUrl, type RenderedEmail } from "../urls";

function render(options: EmailOptions): RenderedEmail {
  const { subject, html, text } = composeEmail(options);
  return { subject, html, text };
}

/* -------------------------------------------------------------------------- */
/* Email verification                                                          */
/* -------------------------------------------------------------------------- */

export function emailVerificationEmail(params: {
  name: string;
  url: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [
    {
      type: "paragraph",
      text: "Please confirm your email address to activate your account. This link expires in 24 hours.",
    },
    {
      type: "note",
      text: "If the link expires you can always request a new one from the verification page.",
    },
  ];

  return render({
    subject: "Verify your Ravelyth Talent email address",
    preheader: "One click and your account is ready.",
    heading: "Verify your email address",
    intro: `Hi ${params.name}, thanks for joining Ravelyth Talent.`,
    blocks,
    cta: { label: "Verify my email", url: params.url },
    secondaryCta: { label: "Resend the link", url: appUrl("/verify-email") },
    footerNote:
      "If you did not create this account you can safely ignore this email.",
    brand: params.brand,
  });
}

export function emailVerificationResentEmail(params: {
  name: string;
  url: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Your new Ravelyth Talent verification link",
    preheader: "We sent you a fresh verification link.",
    heading: "Here is your new verification link",
    intro: `Hi ${params.name}, as requested, here is a fresh link to verify your email address.`,
    blocks: [
      {
        type: "paragraph",
        text: "The previous link has been replaced and the new one expires in 24 hours.",
      },
    ],
    cta: { label: "Verify my email", url: params.url },
    footerNote: "If you did not request this, no action is needed.",
    brand: params.brand,
  });
}

export function accountPendingVerificationEmail(params: {
  name: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Verify your email to start using Ravelyth Talent",
    preheader: "One step left.",
    heading: "Almost there",
    intro: `Hi ${params.name}, your account is ready but your email address is not verified yet.`,
    blocks: [
      {
        type: "paragraph",
        text: "Verify your email address before you sign in and start applying for jobs.",
      },
    ],
    cta: { label: "Resend verification email", url: appUrl("/verify-email") },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Password reset & security                                                   */
/* -------------------------------------------------------------------------- */

export function passwordResetEmail(params: {
  name: string;
  url: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Reset your Ravelyth Talent password",
    preheader: "This link expires in 1 hour.",
    heading: "Reset your password",
    intro: `Hi ${params.name}, we received a request to reset your password.`,
    blocks: [
      {
        type: "paragraph",
        text: "Choose a new password using the button below. The link expires in 1 hour and can be used only once.",
      },
      {
        type: "note",
        text: "If you did not request a password reset, ignore this email. Your password stays unchanged.",
      },
    ],
    cta: { label: "Reset my password", url: params.url },
    brand: params.brand,
  });
}

export function passwordChangedEmail(params: {
  name: string;
  at: string;
  ip?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Your Ravelyth Talent password was changed",
    preheader: "Security notification for your account.",
    heading: "Your password was changed",
    intro: `Hi ${params.name}, the password on your account was just changed.`,
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "Changed at", value: params.at },
          { label: "IP address", value: params.ip ?? "Unknown" },
        ],
      },
      {
        type: "paragraph",
        text: "For your security you were signed out on every device. If this was not you, reset your password immediately and contact support.",
      },
    ],
    cta: { label: "Reset my password", url: appUrl("/forgot-password") },
    brand: params.brand,
  });
}

export function newLoginAlertEmail(params: {
  name: string;
  at: string;
  ip?: string | null;
  device?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "New sign-in to your Ravelyth Talent account",
    preheader: "Security notification for your account.",
    heading: "A new device signed in",
    intro: `Hi ${params.name}, we noticed a new sign-in to your account.`,
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "When", value: params.at },
          { label: "IP address", value: params.ip ?? "Unknown" },
          { label: "Device", value: params.device ?? "Unknown browser" },
        ],
      },
      {
        type: "paragraph",
        text: "If this was you, there is nothing to do. If it was not, secure your account right away.",
      },
    ],
    cta: { label: "Secure my account", url: appUrl("/account/security") },
    brand: params.brand,
  });
}

export function securityAlertEmail(params: {
  name: string;
  title: string;
  details: Array<{ label: string; value: string }>;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Security alert on your Ravelyth Talent account",
    preheader: params.title,
    heading: params.title,
    intro: `Hi ${params.name}, we want to keep you informed about activity on your account.`,
    blocks: [{ type: "detail", rows: params.details }],
    cta: { label: "Review my account", url: appUrl("/account/security") },
    brand: params.brand,
  });
}