import {
  composeEmail,
  type EmailBlock,
  type EmailBrand,
  type EmailOptions,
} from "../layout";
import { appUrl, type RenderedEmail } from "../urls";

function render(options: EmailOptions): RenderedEmail {
  const { subject, html, text } = composeEmail(options);
  return { subject, html, text };
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export function paymentSuccessEmail(params: {
  name: string;
  planName: string;
  amount: string;
  orderId: string;
  invoiceUrl?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [
    {
      type: "detail",
      rows: [
        { label: "Plan", value: params.planName },
        { label: "Amount paid", value: params.amount },
        { label: "Order ID", value: params.orderId },
      ],
    },
    {
      type: "paragraph",
      text: "Your payment was received successfully and your plan is being activated.",
    },
  ];

  if (params.invoiceUrl) {
    blocks.push({
      type: "note",
      text: "A PDF invoice is attached and is always available in your billing history.",
    });
  }

  return render({
    subject: `Payment received - ${params.amount}`,
    preheader: "Thank you, your payment went through.",
    heading: "Payment successful",
    intro: `Thank you ${params.name}, we have received your payment.`,
    blocks,
    cta: { label: "Go to my account", url: appUrl("/dashboard/billing") },
    brand: params.brand,
  });
}

export function paymentFailedEmail(params: {
  name: string;
  planName: string;
  amount: string;
  reason?: string | null;
  retryUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [];
  if (params.reason) {
    blocks.push({ type: "note", text: `Reason: ${params.reason}` });
  }
  blocks.push({
    type: "paragraph",
    text: "No amount has been charged. You can try again with a different payment method.",
  });

  return render({
    subject: `Payment failed for ${params.planName}`,
    preheader: "We could not complete your payment.",
    heading: "Payment failed",
    intro: `Hi ${params.name}, we could not complete your payment of ${params.amount}.`,
    blocks,
    cta: { label: "Try payment again", url: params.retryUrl },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export function subscriptionActivatedEmail(params: {
  name: string;
  planName: string;
  periodLabel: string;
  endsOn: string;
  manageUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Your ${params.planName} plan is active`,
    preheader: "Your subscription has started.",
    heading: "Subscription activated",
    intro: `Hi ${params.name}, your subscription is now active.`,
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "Plan", value: params.planName },
          { label: "Billing period", value: params.periodLabel },
          { label: "Active until", value: params.endsOn },
        ],
      },
      {
        type: "paragraph",
        text: "We will email you before your plan expires so you can renew without a break.",
      },
    ],
    cta: { label: "Manage my plan", url: params.manageUrl },
    brand: params.brand,
  });
}

export function subscriptionRenewedEmail(params: {
  name: string;
  planName: string;
  periodLabel: string;
  endsOn: string;
  manageUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Your ${params.planName} plan has been renewed`,
    preheader: "Your subscription period has been extended.",
    heading: "Subscription renewed",
    intro: `Hi ${params.name}, your payment went through and your plan has been renewed.`,
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "Plan", value: params.planName },
          { label: "Billing period", value: params.periodLabel },
          { label: "Active until", value: params.endsOn },
        ],
      },
    ],
    cta: { label: "View billing history", url: params.manageUrl },
    brand: params.brand,
  });
}

export function subscriptionExpiringSoonEmail(params: {
  name: string;
  planName: string;
  daysLeft: number;
  endsOn: string;
  renewUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [
    {
      type: "detail",
      rows: [
        { label: "Plan", value: params.planName },
        { label: "Expires on", value: params.endsOn },
        { label: "Days remaining", value: String(params.daysLeft) },
      ],
    },
  ];

  if (params.daysLeft <= 3) {
    blocks.push({
      type: "note",
      text: "When your plan expires, paid features stop working. Existing job postings stay live, but you cannot submit new ones without an active plan.",
    });
  }

  return render({
    subject: `Your ${params.planName} plan expires ${params.daysLeft === 1 ? "tomorrow" : `in ${params.daysLeft} days`}`,
    preheader: "Renew now to keep uninterrupted access.",
    heading: "Your plan expires soon",
    intro: `Hi ${params.name}, a quick reminder that your ${params.planName} plan is ending soon.`,
    blocks,
    cta: { label: "Renew my plan", url: params.renewUrl },
    brand: params.brand,
  });
}

export function subscriptionExpiredEmail(params: {
  name: string;
  planName: string;
  endedOn: string;
  renewUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Your ${params.planName} plan has expired`,
    preheader: "Renew any time to restore paid features.",
    heading: "Your plan has expired",
    intro: `Hi ${params.name}, your ${params.planName} subscription ended on ${params.endedOn}.`,
    blocks: [
      {
        type: "paragraph",
        text: "Your account and data are safe. Renew whenever you are ready to switch paid features back on.",
      },
    ],
    cta: { label: "Renew my plan", url: params.renewUrl },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Invoice delivery                                                           */
/* -------------------------------------------------------------------------- */

export function invoiceDeliveryEmail(params: {
  name: string;
  invoiceNumber: string;
  planName: string;
  amount: string;
  issuedOn: string;
  gstNote?: string | null;
  downloadUrl: string;
  hasAttachment?: boolean;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [
    {
      type: "detail",
      rows: [
        { label: "Invoice number", value: params.invoiceNumber },
        { label: "Plan", value: params.planName },
        { label: "Amount", value: params.amount },
        { label: "Issued on", value: params.issuedOn },
        ...(params.gstNote
          ? [{ label: "GST", value: params.gstNote }]
          : []),
      ],
    },
    {
      type: "paragraph",
      text: params.hasAttachment
        ? "A PDF copy is attached to this email."
        : "Download your PDF invoice below - it is always available in your billing history too.",
    },
  ];

  return render({
    subject: `Your invoice ${params.invoiceNumber} - ${params.amount}`,
    preheader: "Thank you for your payment.",
    heading: "Your invoice",
    intro: `Hi ${params.name}, here is the invoice for your recent payment.`,
    blocks,
    cta: { label: "Download invoice", url: params.downloadUrl },
    brand: params.brand,
  });
}