"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { createPreApplyQuestionAction } from "@/lib/chat/actions/create-conversation";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Textarea } from "@/components/ui/primitives";

export function AskQuestionPanel({
  jobId,
  existingConversationId,
  canAsk,
}: {
  jobId: string;
  existingConversationId: string | null;
  canAsk: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createPreApplyQuestionAction,
    initialFormState,
  );

  return (
    <div className="surface space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-navy">
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Ask a question before applying
      </h2>

      {existingConversationId ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p>You have already sent a question for this job.</p>
          <Link
            href={`/dashboard/messages?c=${existingConversationId}`}
            className="inline-block font-semibold text-royal hover:underline"
          >
            Open the conversation
          </Link>
        </div>
      ) : !canAsk ? (
        <p className="text-sm text-slate-600">
          Sign in with a verified email to ask a question by plain text.
        </p>
      ) : (
        <form action={formAction} className="space-y-3">
          {state.status === "success" ? (
            <Alert tone="success">{state.message}</Alert>
          ) : null}
          {state.status === "error" ? (
            <Alert tone="error">{state.message}</Alert>
          ) : null}
          <input type="hidden" name="jobId" value={jobId} />
          <label htmlFor="chat-question" className="sr-only">
            Your question
          </label>
          <Textarea
            id="chat-question"
            name="body"
            rows={3}
            maxLength={1000}
            placeholder="Ask one plain-text question. You can send only one before applying."
          />
          <Button type="submit" size="sm" disabled={pending}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {pending ? "Sending..." : "Send question"}
          </Button>
          <p className="text-[11px] text-slate-400">
            Plain text only, up to 1000 characters. Employer replies appear in
            your messages.
          </p>
        </form>
      )}
    </div>
  );
}
