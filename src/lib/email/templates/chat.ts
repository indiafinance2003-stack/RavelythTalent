import {
  composeEmail,
  type EmailBrand,
  type EmailOptions,
} from "../layout";
import type { RenderedEmail } from "../urls";

function render(options: EmailOptions): RenderedEmail {
  const { subject, html, text } = composeEmail(options);
  return { subject, html, text };
}

/**
 * New-chat-message notification. Deliberately contains NO message text; it only
 * tells the recipient to sign in. Queued at most once per conversation per hour.
 */
export function chatNewMessageEmail(params: {
  recipientName: string;
  senderLabel: string;
  conversationUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "You have a new message on Ravelyth Talent",
    preheader: "Open Ravelyth Talent to read and reply.",
    heading: "You have a new message",
    intro: `Hi ${params.recipientName}, ${params.senderLabel} sent you a message.`,
    blocks: [
      {
        type: "paragraph",
        text: "For your privacy, the message is not included in this email. Sign in to read it and reply.",
      },
      {
        type: "note",
        text: "Never pay money to get a job. Ravelyth Talent never asks candidates for a fee.",
      },
    ],
    cta: { label: "Open the conversation", url: params.conversationUrl },
    brand: params.brand,
  });
}
