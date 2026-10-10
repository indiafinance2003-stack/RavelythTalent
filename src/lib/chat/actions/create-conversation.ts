"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  applications,
  chatConversations,
  chatMessages,
  companies,
  jobs,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { validateChatMessage, isBlocked, applyAutoMuteIfNeeded } from "@/lib/chat/service";
import { countConversationsCreatedToday, countMessagesLastHour } from "@/lib/chat/rate-limit";
import { chatMessageFlagsPayment } from "@/lib/chat/scam-scan";

const schema = z.object({
  jobId: z.uuid(),
  body: z.string().max(1000),
});

export async function createPreApplyConversation(formData: FormData) {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  const parsed = schema.safeParse({
    jobId: formData.get("jobId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    throw new AppError("Invalid input.", 422);
  }
  const { jobId, body } = parsed.data;
  const message = validateChatMessage(body);

  const job = (
    await db
      .select({ id: jobs.id, companyId: jobs.companyId, status: jobs.status })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1)
  ).at(0);
  if (!job || job.status !== "published") {
    throw new AppError("Job not found.", 404);
  }

  const company = (
    await db
      .select({ chatEnabled: companies.chatEnabled, chatBeforeApplyEnabled: companies.chatBeforeApplyEnabled })
      .from(companies)
      .where(eq(companies.id, job.companyId))
      .limit(1)
  ).at(0);
  if (!company?.chatEnabled || !company.chatBeforeApplyEnabled) {
    throw new AppError("Chat not available for this job.", 403, "chat_disabled");
  }

  if (await isBlocked(job.companyId, user.id)) {
    throw new AppError("You cannot message this employer.", 403, "chat_blocked");
  }

  if (user.chatMuteUntil && user.chatMuteUntil > new Date()) {
    throw new AppError("Messaging is temporarily muted.", 403, "chat_muted");
  }

  const existingApp = (
    await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.jobId, jobId), eq(applications.candidateUserId, user.id)))
      .limit(1)
  ).at(0);
  if (existingApp) {
    throw new AppError("You already applied. Use the applicant messages.", 400, "already_applied");
  }

  const existingPre = (
    await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.jobId, jobId),
          eq(chatConversations.candidateUserId, user.id),
          eq(chatConversations.preApply, true),
        ),
      )
      .limit(1)
  ).at(0);
  if (existingPre) {
    throw new AppError("You already have a pre-apply question for this job.", 400, "preapply_limit");
  }

  if ((await countConversationsCreatedToday(user.id)) >= 5) {
    throw new AppError("Too many conversations today. Try again later.", 429, "chat_rate_limited");
  }
  if ((await countMessagesLastHour(user.id)) >= 20) {
    throw new AppError("Too many messages. Slow down.", 429, "chat_rate_limited");
  }

  const flagged = chatMessageFlagsPayment(message);
  const now = new Date();

  const [conv] = await db
    .insert(chatConversations)
    .values({
      jobId,
      companyId: job.companyId,
      candidateUserId: user.id,
      preApply: true,
      status: "open",
      lastMessageAt: now,
    })
    .returning({ id: chatConversations.id });

  await db.insert(chatMessages).values({
    conversationId: conv.id,
    senderUserId: user.id,
    senderSide: "candidate",
    body: message,
    flagged,
  });

  if (flagged) {
    await applyAutoMuteIfNeeded(user.id);
  }

  revalidatePath(`/dashboard/messages`);
  revalidatePath(`/jobs/${jobId}`);
}
