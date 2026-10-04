import { existsSync } from "node:fs";
import path from "node:path";
import { getSiteSettings, socialLinks } from "@/lib/settings";
import type { EmailBrand } from "./layout";
import { appUrl } from "./urls";
import { enqueueEmail, type EnqueueAttachment } from "./queue";
import type { RenderedEmail } from "./urls";

/**
 * High-level helper: resolves the brand from site_settings and queues the
 * message. It NEVER throws - a mail problem must not break a user request.
 */

/** Contact details for email headers/footers, empty until an admin fills them. */
export async function getEmailBrand(): Promise<EmailBrand> {
  const settings = await getSiteSettings();
  const address = [
    settings.addressLine1,
    settings.addressLine2,
    settings.city,
    settings.state,
    settings.postalCode,
    settings.country,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    brandName: settings.brandName,
    tagline: settings.tagline,
    contactEmail: settings.contactEmail,
    supportEmail: settings.supportEmail,
    address: address || null,
    social: socialLinks(settings),
    logoUrl: existsSync(path.join(process.cwd(), "public", "logo.svg"))
      ? appUrl("/logo.svg")
      : null,
  };
}

export type QueueRenderedInput = {
  to: string;
  toName?: string | null;
  templateKey: string;
  rendered: RenderedEmail;
  metadata?: Record<string, unknown>;
  attachments?: EnqueueAttachment[];
};

export async function queueRenderedEmail(
  input: QueueRenderedInput,
): Promise<void> {
  try {
    await enqueueEmail({
      to: input.to,
      toName: input.toName ?? null,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      templateKey: input.templateKey,
      metadata: input.metadata ?? {},
      attachments: input.attachments ?? [],
    });
  } catch (error) {
    console.error(
      `[email] could not queue "${input.templateKey}" for ${input.to}:`,
      error,
    );
  }
}