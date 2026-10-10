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
import { listEmployerConversations } from "@/lib/chat/queries";
import { loadConversationView } from "@/lib/chat/thread-view";
import { listUserCompanies } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Messages",
  description: "Conversations with candidates.",
};

type SearchParams = { c?: string };

export default async function RecruiterMessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser("/recruiter/messages");
  const params = await searchParams;

  if (!(await isGlobalChatEnabled())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Messages" description="Conversations with candidates." />
        <Alert tone="info" title="Chat is unavailable">
          Chat is temporarily turned off. Please check back later.
        </Alert>
      </div>
    );
  }

  const memberships = await listUserCompanies(user.id);
  const conversations = await listEmployerConversations(
    memberships.map((membership) => membership.id),
  );
  const selectedId = params.c ?? null;
  const view = selectedId
    ? await loadConversationView({
        conversationId: selectedId,
        viewer: user,
        party: "employer",
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Continue conversations with applicants."
      />

      {conversations.length === 0 && !view ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" aria-hidden="true" />}
          title="No conversations yet"
          description="Message an applicant from their application to start a conversation."
          action={
            <ButtonLink href="/recruiter/applications" variant="secondary">
              View applications
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <ConversationList
              items={conversations}
              basePath="/recruiter/messages"
              activeId={selectedId}
            />
          </div>
          <div>
            {view ? (
              <ChatThread
                conversationId={view.detail.id}
                viewerSide="employer"
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
