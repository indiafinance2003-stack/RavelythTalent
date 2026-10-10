import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatConversations } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { handleApi, jsonOk } from "@/lib/http";
import { assertGlobalChatEnabled } from "@/lib/chat/gate";
import {
  listConversationMessages,
  markConversationRead,
} from "@/lib/chat/queries";
import type { ChatSide } from "@/lib/chat/rules";
import { listUserCompanies } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * Polled by the chat thread every 10 seconds. Only the candidate or an active
 * member of the conversation's company may read the messages (returns 403 for
 * anyone else, so conversations cannot be probed).
 */
export const GET = handleApi(
  async (request: Request, { params }: { params: Params }): Promise<NextResponse> => {
    await assertGlobalChatEnabled();

    const { id } = await params;
    const conversationId = z.uuid().safeParse(id);
    if (!conversationId.success) {
      throw new AppError("Conversation not found.", 404, "not_found");
    }

    const user = await requireApiVerifiedUser();

    const conv = (
      await db
        .select({
          id: chatConversations.id,
          candidateUserId: chatConversations.candidateUserId,
          companyId: chatConversations.companyId,
        })
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId.data))
        .limit(1)
    ).at(0);
    if (!conv) throw new AppError("Conversation not found.", 404, "not_found");

    let party: ChatSide | null = null;
    if (user.id === conv.candidateUserId) {
      party = "candidate";
    } else {
      const memberships = await listUserCompanies(user.id);
      if (memberships.some((c) => c.id === conv.companyId)) {
        party = "employer";
      }
    }
    if (!party) {
      throw new AppError(
        "You do not have access to this conversation.",
        403,
        "not_a_participant",
      );
    }

    const afterRaw = new URL(request.url).searchParams.get("after");
    const after = afterRaw ? new Date(afterRaw) : null;
    const messages = await listConversationMessages(
      conversationId.data,
      after,
    );

    if (after) {
      await markConversationRead(conversationId.data, party);
    }

    return jsonOk({
      messages: messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
        readAt: message.readAt ? message.readAt.toISOString() : null,
      })),
      at: new Date().toISOString(),
    });
  },
);