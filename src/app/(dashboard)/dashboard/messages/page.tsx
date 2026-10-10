import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import {
  Alert,
  ButtonLink,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { ChatThread } from "@/components/chat/chat-thread";
import { ConversationList } from "@/components/chat/conversation-list";
import { isGlobalChatEnabled } from "@/lib/chat/gate";
import { listCandidateConversations } from "@/lib/chat/queries";
import { loadConversationView } from "@/lib/chat/thread-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your conversations with employers.",
};

type SearchParams = { c?: string };

export default async function DashboardMessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/dashboard/messages");
  const params = await searchParams;

  if (!(await isGlobalChatEnabled())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Messages" description="Conversations with recruiters." />
        <Alert tone="info" title="Chat is unavailable">
          Chat is temporarily turned off. Please check back later.
        </Alert>
      </div>
    );
  }

  const conversations = await listCandidateConversations(user.id);
  const selectedId = params.c ?? null;
  const view = selectedId
    ? await loadConversationView({
        conversationId: selectedId,
        viewer: user,
        party: "candidate",
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Ask employers questions and continue conversations."
      />

      {conversations.length === 0 && !view ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden="true" />}
          title="No conversations yet"
          description="Once you ask a question before applying, or an employer messages you, your conversations appear here."
          action={
            <ButtonLink href="/jobs" variant="secondary">
              Browse jobs
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <ConversationList
              items={conversations}
              basePath="/dashboard/messages"
              activeId={selectedId}
            />
          </div>
          <div>
            {view ? (
              <ChatThread
                conversationId={view.detail.id}
                viewerSide="candidate"
                counterpartName={view.counterpartName}
                counterpartUserId={view.counterpartUserId}
                jobTitle={view.detail.jobTitle}
                initialMessages={view.messages}
                canSend={view.canSend}
                sendDisabledReason={view.sendDisabledReason}
              />
            ) : (
              <div className="surface flex h-[70vh] items-center justify-center p-6 text-center text-sm text-slate-500">
                {selectedId
                  ? "That conversation could not be found."
                  : "Select a conversation to read and reply."}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Read how we handle chat data in our{" "}
        <Link href="/privacy" className="font-semibold text-royal hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
