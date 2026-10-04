import { composeEmail, type EmailBrand } from "../layout";
import type { RenderedEmail } from "../urls";

export function contactInquiryEmail(params: {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const subject = params.subject?.trim() || "New contact form message";
  const rendered = composeEmail({
    subject: `Contact form: ${subject}`,
    preheader: `New message from ${params.name}`,
    heading: "New contact form message",
    intro: "A visitor submitted a message through the public contact form.",
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "Name", value: params.name },
          { label: "Email", value: params.email },
          ...(params.phone ? [{ label: "Phone", value: params.phone }] : []),
          { label: "Subject", value: subject },
        ],
      },
      { type: "quote", text: params.message },
    ],
    brand: params.brand,
  });
  return { subject: rendered.subject, html: rendered.html, text: rendered.text };
}
