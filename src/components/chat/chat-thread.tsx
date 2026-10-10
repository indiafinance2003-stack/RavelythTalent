"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Flag, Loader2, Send, ShieldAlert } from "lucide-react";
import { sendMessageAction } from "@/lib/chat/actions/send-message";
import { reportMessageAction } from "@/lib/chat/actions/report-message";
import { blockUser } from "@/lib/chat/actions/block-user";
import { initialFormState } from "@/lib/form-state";
import { Alert, Button, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type ThreadMessage = {
  id: string;
  senderSide: "candidate" | "employer";
  senderUserId: string;
  body: string;
  flagged: boolean;
  createdAt: string;
  readAt: string | null;
};

const POLL_MS = 10_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatThread({
  conversationId,
  viewerSide,
  counterpartName,
  counterpartUserId,
  jobTitle,
  initialMessages,
  canSend,
  sendDisabledReason,
}: {
  conversationId: string;
  viewerSide: "candidate" | "employer";
  counterpartName: string;
  counterpartUserId: string | null;
  jobTitle: string;
  initialMessages: ThreadMessage[];
  canSend: boolean;
  sendDisabledReason?: string;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const lastAtRef = useRef<string | null>(
    initialMessages.at(-1)?.createdAt ?? null,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [state, formAction, pending] = useActionState(
    sendMessageAction,
    initialFormState,
  );
  const [reportState, reportAction, reportPending] = useActionState(
    reportMessageAction,
    initialFormState,
  );

  useEffect(() => {
    lastAtRef.current = messages.at(-1)?.createdAt ?? lastAtRef.current;
  }, [messages]);

  const refresh = useCallback(async () => {
    try {
      const after = lastAtRef.current;
      const url = `/api/chat/conversations/${conversationId}/messages${
        after ? `?after=${encodeURIComponent(after)}` : ""
      }`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload?.ok) return;
      const incoming: ThreadMessage[] = payload.data?.messages ?? [];
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((message) => message.id));
        return [...prev, ...incoming.filter((message) => !seen.has(message.id))];
      });
    } catch {
      /* transient network error - next poll will retry */
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (state.status === "success") {
      if (bodyRef.current) bodyRef.current.value = "";
      void refresh();
    }
  }, [state, refresh]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <div className="surface flex h-[70vh] flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy">
            {counterpartName}
          </p>
          <p className="truncate text-xs text-slate-500">{jobTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:border-royal hover:text-royal">
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              Report
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
              <form action={reportAction} className="space-y-2">
                {reportState.status === "success" ? (
                  <Alert tone="success">{reportState.message}</Alert>
                ) : null}
                {reportState.status === "error" ? (
                  <Alert tone="error">{reportState.message}</Alert>
                ) : null}
                <input type="hidden" name="conversationId" value={conversationId} />
                <Select name="reason" defaultValue="spam" aria-label="Reason">
                  <option value="spam">Spam</option>
                  <option value="scam">Scam or fraud</option>
                  <option value="abuse">Abuse</option>
                  <option value="harassment">Harassment</option>
                  <option value="other">Other</option>
                </Select>
                <Textarea
                  name="details"
                  rows={2}
                  maxLength={500}
                  placeholder="Anything else we should know? (optional)"
                />
                <Button type="submit" size="sm" disabled={reportPending}>
                  Submit report
                </Button>
              </form>
            </div>
          </details>
          {counterpartUserId ? (
            <form action={blockUser}>
              <input
                type="hidden"
                name="blockedUserId"
                value={counterpartUserId}
              />
              <button
                type="submit"
                className="flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:border-red-400"
              >
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                Block
              </button>
            </form>
          ) : null}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            No messages yet. Say hello.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.senderSide === viewerSide;
            return (
              <div
                key={message.id}
                className={cn("flex", mine ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    mine
                      ? "bg-royal text-white"
                      : "bg-slate-100 text-navy",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-2 text-[11px]",
                      mine ? "text-white/70" : "text-slate-500",
                    )}
                  >
                    <span suppressHydrationWarning>
                      {formatTime(message.createdAt)}
                    </span>
                    {message.flagged ? (
                      <span className="font-semibold text-amber-500">
                        Flagged for review
                      </span>
                    ) : null}
                    {mine && message.readAt ? <span>Read</span> : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        {state.status === "error" ? (
          <Alert tone="error" className="mb-2">
            {state.message}
          </Alert>
        ) : null}
        {canSend ? (
          <form action={formAction} className="flex items-end gap-2">
            <input type="hidden" name="conversationId" value={conversationId} />
            <label htmlFor="chat-body" className="sr-only">
              Message
            </label>
            <Textarea
              id="chat-body"
              name="body"
              ref={bodyRef}
              rows={2}
              maxLength={1000}
              placeholder="Write a plain-text message (max 1000 characters)."
              className="min-h-0 flex-1"
            />
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Send
            </Button>
          </form>
        ) : (
          <Alert tone="info">
            {sendDisabledReason ??
              "You cannot send messages in this conversation right now."}
          </Alert>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Payment requests are flagged automatically. Never pay to get a job.
        </p>
      </div>
    </div>
  );
}
