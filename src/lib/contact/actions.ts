"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { contactMessages } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { enforceRateLimit, rateKey, RATE_LIMITS } from "@/lib/rate-limit";
import { assertSameOrigin, getRequestIp } from "@/lib/security";
import { getSiteSettings } from "@/lib/settings";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { contactInquiryEmail } from "@/lib/email/templates/contact";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40),
  subject: z.string().trim().max(180),
  message: z.string().trim().min(20).max(5000),
});

export async function submitContactMessageAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const parsed = schema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone") ?? "",
      subject: formData.get("subject") ?? "",
      message: formData.get("message"),
    });
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    }

    const { name, email, phone, subject, message } = parsed.data;
    const settings = await getSiteSettings();
    const recipient =
      settings.supportEmail ?? settings.contactEmail ?? getEnv().SUPPORT_EMAIL;
    if (!recipient) {
      return formError("The support inbox is not configured yet. Please try again later.");
    }

    const ip = await getRequestIp();
    const bucket = ip ?? createHash("sha256").update(email.toLowerCase()).digest("hex");
    await enforceRateLimit(rateKey("contactForm", bucket), RATE_LIMITS.contactForm);
    await db.insert(contactMessages).values({
      name,
      email: email.toLowerCase(),
      phone: phone || null,
      subject: subject || null,
      message,
      ip: ip?.slice(0, 80) ?? null,
    });

    await queueRenderedEmail({
      to: recipient,
      templateKey: "contact_inquiry",
      rendered: contactInquiryEmail({
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        subject: subject || null,
        message,
        brand: await getEmailBrand(),
      }),
      metadata: { senderEmail: email.toLowerCase() },
    });
    revalidatePath("/admin/support");
    return formSuccess("Your message was received. The support team will review it.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[contact] submission failed:", error);
    return formError("We could not send your message. Please try again.");
  }
}
