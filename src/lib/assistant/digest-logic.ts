import { composeEmail } from "@/lib/email/layout";
import { appUrl, type RenderedEmail } from "@/lib/email/urls";

export function istDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00+05:30`);
}

export function isSameIstDay(a: Date, b: Date): boolean {
  return istDayStart(a).getTime() === istDayStart(b).getTime();
}

export type DigestCounts = {
  approvalsWaiting: number;
  threadsNeedingAttention: number;
  newReplies24h: number;
  newInterestedLeads: number;
  targetsToReview: number;
  formsPending: number;
  sendsYesterday: number;
  bouncesYesterday: number;
};

export const EMPTY_DIGEST_COUNTS: DigestCounts = {
  approvalsWaiting: 0,
  threadsNeedingAttention: 0,
  newReplies24h: 0,
  newInterestedLeads: 0,
  targetsToReview: 0,
  formsPending: 0,
  sendsYesterday: 0,
  bouncesYesterday: 0,
};

export function digestHasContent(counts: DigestCounts): boolean {
  return Object.values(counts).some((value) => value > 0);
}

export function digestDecision(
  counts: DigestCounts,
  lastQueuedAt: Date | null,
  now: Date,
): "send" | "skip_already_sent" | "skip_empty" {
  if (lastQueuedAt && isSameIstDay(lastQueuedAt, now)) return "skip_already_sent";
  if (!digestHasContent(counts)) return "skip_empty";
  return "send";
}

export type DigestItem = { label: string; href: string };

export function digestItems(counts: DigestCounts): DigestItem[] {
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  const items: DigestItem[] = [];
  if (counts.approvalsWaiting > 0) {
    items.push({
      label: `${plural(counts.approvalsWaiting, "campaign message")} awaiting your approval.`,
      href: appUrl("/admin/assistant/campaigns"),
    });
  }
  if (counts.threadsNeedingAttention > 0) {
    items.push({
      label: counts.threadsNeedingAttention === 1
        ? "1 inbox thread needs attention."
        : `${counts.threadsNeedingAttention} inbox threads need attention.`,
      href: appUrl("/admin/assistant"),
    });
  }
  if (counts.newReplies24h > 0) {
    items.push({
      label: `${plural(counts.newReplies24h, "new reply")} in the last 24 hours.`,
      href: appUrl("/admin/assistant"),
    });
  }
  if (counts.newInterestedLeads > 0) {
    items.push({
      label: `${counts.newInterestedLeads} new interested lead${counts.newInterestedLeads === 1 ? "" : "s"} this week.`,
      href: appUrl("/admin/assistant/leads"),
    });
  }
  if (counts.targetsToReview > 0) {
    items.push({
      label: `${plural(counts.targetsToReview, "crawled target")} ready to review.`,
      href: appUrl("/admin/assistant/targets"),
    });
  }
  if (counts.formsPending > 0) {
    items.push({
      label: `${plural(counts.formsPending, "contact form")} in the manual queue.`,
      href: appUrl("/admin/assistant/contact-forms"),
    });
  }
  if (counts.sendsYesterday > 0) {
    items.push({
      label: `${plural(counts.sendsYesterday, "campaign email")} sent yesterday.`,
      href: appUrl("/admin/assistant/campaigns"),
    });
  }
  if (counts.bouncesYesterday > 0) {
    items.push({
      label: `${counts.bouncesYesterday} bounce${counts.bouncesYesterday === 1 ? "" : "s"} yesterday — review deliverability.`,
      href: appUrl("/admin/assistant/campaigns"),
    });
  }
  return items;
}

export function buildDigestEmail(counts: DigestCounts, sentAt = new Date()): RenderedEmail {
  const items = digestItems(counts);
  const { subject, html, text } = composeEmail({
    subject: `Your daily assistant digest — ${sentAt.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}`,
    preheader: items.length
      ? `${items.length} item${items.length === 1 ? "" : "s"} need your attention.`
      : "Everything is quiet. No action needed.",
    heading: "Assistant daily digest",
    intro: "Here is what the assistant has done and what still needs you today.",
    blocks: items.length
      ? [{ type: "bullets", items: items.map((item) => `${item.label} → ${item.href}`) }]
      : [{ type: "paragraph", text: "Nothing needs your attention today. Deliverability and inbox are quiet." }],
    cta: items.length ? { label: "Open assistant inbox", url: appUrl("/admin/assistant") } : undefined,
    footerNote: "This is an internal operations digest. No candidate or lead was emailed for this.",
  });
  return { subject, html, text };
}