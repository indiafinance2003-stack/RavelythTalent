"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, chatReports } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";

const schema = z.object({
  conversationId: z.uuid(),
  status: z.enum(["reviewed", "resolved"]),
});

/** Marks every report on a conversation as reviewed/resolved and audits it. */
export async function resolveConversationReportsAction(formData: FormData) {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new AppError("Invalid input.", 422);

  await db
    .update(chatReports)
    .set({
      status: parsed.data.status,
      reviewedByUserId: admin.id,
      reviewedAt: new Date(),
    })
    .where(eq(chatReports.conversationId, parsed.data.conversationId));

  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: `chat_report.${parsed.data.status}`,
    entityType: "chat_conversation",
    entityId: parsed.data.conversationId,
    description: `Chat reports marked ${parsed.data.status}.`,
    metadata: {},
  });

  revalidatePath("/admin/chat-reports");
  revalidatePath(`/admin/chat-reports/${parsed.data.conversationId}`);
}
