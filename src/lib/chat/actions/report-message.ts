"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { db } from "@/lib/db";
import { chatReports } from "@/lib/db/schema";
import { assertGlobalChatEnabled } from "@/lib/chat/gate";

const schema = z.object({
  conversationId: z.uuid().optional(),
  messageId: z.uuid().optional(),
  reason: z.enum(["spam", "scam", "abuse", "harassment", "other"]),
  details: z.string().max(500).optional(),
});

export async function reportMessageAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    await assertGlobalChatEnabled();
    const parsed = schema.safeParse({
      conversationId: formData.get("conversationId") || undefined,
      messageId: formData.get("messageId") || undefined,
      reason: formData.get("reason"),
      details: formData.get("details") || undefined,
    });
    if (!parsed.success) {
      return formError("Please choose a reason for the report.");
    }
    const { conversationId, messageId, reason, details } = parsed.data;
    if (!conversationId && !messageId) {
      return formError("Please choose a reason for the report.");
    }

    await db.insert(chatReports).values({
      conversationId: conversationId ?? null,
      messageId: messageId ?? null,
      reporterUserId: user.id,
      reason,
      details: details ?? null,
      status: "open",
    });

    revalidatePath(`/dashboard/messages`);
    revalidatePath(`/recruiter/messages`);
    revalidatePath(`/admin/chat-reports`);
    return formSuccess(
      "Thank you. Our team reviews reported conversations only, and only when reported.",
    );
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[chat] report failed:", error);
    return formError("We could not submit your report. Please try again.");
  }
}
