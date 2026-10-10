import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  ne,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chatConversations,
  chatMessages,
  companies,
  jobs,
} from "@/lib/db/schema";
import { users } from "@/lib/db/schema/auth";
import { listUserCompanies } from "@/lib/entitlements";
import { canViewConversation, type ChatSide } from "./rules";

export type ChatListItem = {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
  candidateName: string;
  counterpartName: string;
  lastMessagePreview: string | null;
  lastMessageAt: Date;
  unreadCount: number;
  preApply: boolean;
};

export type ChatMessageRow = {
  id: string;
  senderUserId: string;
  senderSide: ChatSide;
  body: string;
  flagged: boolean;
  createdAt: Date;
  readAt: Date | null;
};

const conversationColumns = {
  id: chatConversations.id,
  jobId: chatConversations.jobId,
  companyId: chatConversations.companyId,
  candidateUserId: chatConversations.candidateUserId,
  preApply: chatConversations.preApply,
  status: chatConversations.status,
  lastMessageAt: chatConversations.lastMessageAt,
  jobTitle: jobs.title,
  companyName: companies.name,
  candidateName: users.fullName,
};

async function decorate(
  rows: Array<{
    id: string;
    jobId: string;
    companyId: string;
    candidateUserId: string;
    preApply: boolean;
    status: string;
    lastMessageAt: Date;
    jobTitle: string;
    companyName: string;
    candidateName: string;
  }>,
  party: ChatSide,
): Promise<ChatListItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      const [last] = await db
        .select({ body: chatMessages.body })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, row.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      const [unread] = await db
        .select({ value: count() })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, row.id),
            ne(chatMessages.senderSide, party),
            isNull(chatMessages.readAt),
          ),
        );
      return {
        id: row.id,
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        companyId: row.companyId,
        companyName: row.companyName,
        candidateName: row.candidateName,
        counterpartName:
          party === "candidate" ? row.companyName : row.candidateName,
        lastMessagePreview: last?.body ?? null,
        lastMessageAt: row.lastMessageAt,
        unreadCount: unread?.value ?? 0,
        preApply: row.preApply,
      };
    }),
  );
}

export async function listCandidateConversations(
  userId: string,
): Promise<ChatListItem[]> {
  const rows = await db
    .select(conversationColumns)
    .from(chatConversations)
    .innerJoin(jobs, eq(jobs.id, chatConversations.jobId))
    .innerJoin(companies, eq(companies.id, chatConversations.companyId))
    .innerJoin(users, eq(users.id, chatConversations.candidateUserId))
    .where(eq(chatConversations.candidateUserId, userId))
    .orderBy(desc(chatConversations.lastMessageAt));
  return decorate(rows, "candidate");
}

export async function listEmployerConversations(
  companyIds: string[],
): Promise<ChatListItem[]> {
  if (companyIds.length === 0) return [];
  const rows = await db
    .select(conversationColumns)
    .from(chatConversations)
    .innerJoin(jobs, eq(jobs.id, chatConversations.jobId))
    .innerJoin(companies, eq(companies.id, chatConversations.companyId))
    .innerJoin(users, eq(users.id, chatConversations.candidateUserId))
    .where(inArray(chatConversations.companyId, companyIds))
    .orderBy(desc(chatConversations.lastMessageAt));
  return decorate(rows, "employer");
}

export type ConversationDetail = {
  id: string;
  jobId: string;
  companyId: string;
  candidateUserId: string;
  preApply: boolean;
  status: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
};

/** Returns the conversation only if the viewer is allowed to read it (IDOR). */
export async function getConversationForViewer(
  conversationId: string,
  viewerUserId: string,
  party: ChatSide,
): Promise<ConversationDetail | null> {
  const [row] = await db
    .select(conversationColumns)
    .from(chatConversations)
    .innerJoin(jobs, eq(jobs.id, chatConversations.jobId))
    .innerJoin(companies, eq(companies.id, chatConversations.companyId))
    .innerJoin(users, eq(users.id, chatConversations.candidateUserId))
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!row) return null;

  const viewerCompanyIds =
    party === "employer"
      ? (await listUserCompanies(viewerUserId)).map((company) => company.id)
      : [];

  const allowed = canViewConversation({
    viewerUserId,
    viewerCompanyIds,
    candidateUserId: row.candidateUserId,
    companyId: row.companyId,
    party,
  });
  return allowed ? row : null;
}

export async function listConversationMessages(
  conversationId: string,
  after?: Date | null,
): Promise<ChatMessageRow[]> {
  const condition = after
    ? and(
        eq(chatMessages.conversationId, conversationId),
        gt(chatMessages.createdAt, after),
      )
    : eq(chatMessages.conversationId, conversationId);
  const rows = await db
    .select({
      id: chatMessages.id,
      senderUserId: chatMessages.senderUserId,
      senderSide: chatMessages.senderSide,
      body: chatMessages.body,
      flagged: chatMessages.flagged,
      createdAt: chatMessages.createdAt,
      readAt: chatMessages.readAt,
    })
    .from(chatMessages)
    .where(condition)
    .orderBy(asc(chatMessages.createdAt))
    .limit(300);
  return rows;
}

/** Marks the messages the other side sent as read. */
export async function markConversationRead(
  conversationId: string,
  party: ChatSide,
): Promise<void> {
  await db
    .update(chatMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        ne(chatMessages.senderSide, party),
        isNull(chatMessages.readAt),
      ),
    );
}

export async function getUserContact(userId: string): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const [row] = await db
    .select({ id: users.id, name: users.fullName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function getCompanyOwnerContact(companyId: string): Promise<{
  id: string;
  name: string;
  email: string;
  companyName: string;
} | null> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.fullName,
      email: users.email,
      companyName: companies.name,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.ownerUserId))
    .where(eq(companies.id, companyId))
    .limit(1);
  return row ?? null;
}

/** The company owner's user id, used to resolve user-level chat blocks. */
export async function getCompanyOwnerId(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: companies.ownerUserId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.id ?? null;
}

export async function getCompanyChatFlags(companyId: string): Promise<{
  chatEnabled: boolean;
  chatBeforeApplyEnabled: boolean;
} | null> {
  const [row] = await db
    .select({
      chatEnabled: companies.chatEnabled,
      chatBeforeApplyEnabled: companies.chatBeforeApplyEnabled,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row ?? null;
}
