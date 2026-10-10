"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { assertSameOrigin } from "@/lib/security";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { formError, formSuccess, type FormState } from "@/lib/form-state";
import { db } from "@/lib/db";
import {
  applications,
  chatConversations,
  chatMessages,
  jobs,
} from "@/lib/db/schema";
import { requireCompanyMembership } from "@/lib/entitlements";
import { assertGlobalChatEnabled } from "@/lib/chat/gate";
import { decideEmployerStart, decidePreApplyQuestion } from "@/lib/chat/rules";
import {
  applyAutoMuteIfNeeded,
  isBlocked,
  validateChatMessage,
} from "@/lib/chat/service";
import {
  countConversationsCreatedToday,
  countMessagesLastHour,
} from "@/lib/chat/rate-limit";
import { chatMessageFlagsPayment } from "@/lib/chat/scam-scan";
import { getCompanyChatFlags, getCompanyOwnerId } from "@/lib/chat/queries";
import { notifyChatCounterparty } from "@/lib/chat/notify";

const schema = z.object({
  jobId: z.uuid(),
  body: z.string().max(1200),
});

/** Candidate sends the single pre-application question allowed per job. */
export async function createPreApplyQuestionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    await assertGlobalChatEnabled();

    const parsed = schema.safeParse({
      jobId: formData.get("jobId"),
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Invalid input.");
    }
    const { jobId, body } = parsed.data;

    const job = (
      await db
        .select({ id: jobs.id, companyId: jobs.companyId, status: jobs.status })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)
    ).at(0);
    if (!job || job.status !== "published") {
      return formError("This job is not available.");
    }

    const company = await getCompanyChatFlags(job.companyId);
    const existingApp = (
      await db
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.jobId, jobId),
            eq(applications.candidateUserId, user.id),
          ),
        )
        .limit(1)
    ).at(0);
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

    const ownerId = await getCompanyOwnerId(job.companyId);
    const blocked = ownerId
      ? (await isBlocked(ownerId, user.id)) || (await isBlocked(user.id, ownerId))
      : false;

    const decision = decidePreApplyQuestion({
      globalEnabled: true,
      companyChatEnabled: company?.chatEnabled ?? false,
      companyChatBeforeApplyEnabled: company?.chatBeforeApplyEnabled ?? false,
      hasApplication: Boolean(existingApp),
      hasExistingPreApplyConversation: Boolean(existingPre),
      blocked,
      mutedUntil: user.chatMuteUntil,
      now: new Date(),
      messagesLastHour: await countMessagesLastHour(user.id),
      conversationsToday: await countConversationsCreatedToday(user.id),
    });
    if (!decision.allowed) {
      return formError(decision.message);
    }

    const message = validateChatMessage(body);
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

    await notifyChatCounterparty({
      conversationId: conv.id,
      senderSide: "candidate",
      senderUserId: user.id,
      candidateUserId: user.id,
      companyId: job.companyId,
    });

    revalidatePath("/dashboard/messages");
    revalidatePath("/recruiter/messages");
    revalidatePath(`/jobs`);
    return formSuccess(
      "Your question was sent. The employer can reply, after which you can continue the conversation.",
    );
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    console.error("[chat] pre-apply question failed:", error);
    return formError("We could not send your question. Please try again.");
  }
}

/** Employer starts a conversation from an applicant card (application required). */
export async function startEmployerConversationAction(
  formData: FormData,
): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  await assertGlobalChatEnabled();

  const applicationId = z.uuid().parse(formData.get("applicationId"));
  const app = (
    await db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        candidateUserId: applications.candidateUserId,
        companyId: jobs.companyId,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, applicationId))
      .limit(1)
  ).at(0);
  if (!app) throw new AppError("Application not found.", 404);

  await requireCompanyMembership(user.id, app.companyId);
  const company = await getCompanyChatFlags(app.companyId);
  const blocked =
    (await isBlocked(user.id, app.candidateUserId)) ||
    (await isBlocked(app.candidateUserId, user.id));
  const decision = decideEmployerStart({
    globalEnabled: true,
    companyChatEnabled: company?.chatEnabled ?? false,
    isCompanyMember: true,
    hasApplication: true,
    blocked,
    mutedUntil: user.chatMuteUntil,
    now: new Date(),
    messagesLastHour: await countMessagesLastHour(user.id),
  });
  if (!decision.allowed) {
    throw new AppError(decision.message, 403, decision.code);
  }

  const existing = (
    await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.jobId, app.jobId),
          eq(chatConversations.candidateUserId, app.candidateUserId),
          eq(chatConversations.preApply, false),
        ),
      )
      .limit(1)
  ).at(0);

  const conversationId =
    existing?.id ??
    (
      await db
        .insert(chatConversations)
        .values({
          jobId: app.jobId,
          companyId: app.companyId,
          candidateUserId: app.candidateUserId,
          applicationId: app.id,
          preApply: false,
          status: "open",
        })
        .returning({ id: chatConversations.id })
    ).at(0)!.id;

  revalidatePath("/recruiter/messages");
  redirect(`/recruiter/messages?c=${conversationId}`);
}
