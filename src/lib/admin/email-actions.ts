"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { composeEmail } from "@/lib/email/layout";
import { retryOutboxEmail } from "@/lib/email/queue";
import { assertSameOrigin } from "@/lib/security";

export async function retryFailedEmailAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  await requireApiAdmin();
  const parsed = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!parsed.success) throw new AppError("Invalid outbox message.", 422);
  await retryOutboxEmail(parsed.data);
  revalidatePath("/admin/emails");
}

export async function sendTestEmailAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = z.string().email().max(254).safeParse(formData.get("email"));
  if (!parsed.success) throw new AppError("Enter a valid recipient email.", 422);

  const brand = await getEmailBrand();
  const rendered = composeEmail({
    subject: "Ravelyth Talent test email",
    preheader: "SMTP delivery check.",
    heading: "Email delivery test",
    intro: `Hi ${admin.fullName}, this test message was requested from the admin panel.`,
    blocks: [{ type: "paragraph", text: "The email outbox accepted this message. Delivery is processed by the SMTP worker." }],
    brand,
  });
  await queueRenderedEmail({
    to: parsed.data,
    templateKey: "admin_test",
    rendered,
    metadata: { requestedBy: admin.id },
  });
  revalidatePath("/admin/emails");
}
