export type RuleClassification = {
  category: "bounce" | "out_of_office" | "opt_out" | "payment" | "account" | "job_report" | "complaint" | "general";
  urgency: "high" | "normal" | "low";
  summary: string;
  needsHuman: boolean;
  isOptOut: boolean;
  isBounce: boolean;
};

/**
 * Returns only the sender's new text, stopping at the first quoted-history
 * marker and skipping individual `>` quote lines.
 */
export function stripQuotedText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (/^\s*>/.test(line)) continue;
    if (/^-{2,}\s*(?:original message|forwarded message)\s*-{2,}$/i.test(trimmed)) break;
    if (/^_{5,}$/.test(trimmed)) break;
    if (/^\s*From\s*:/i.test(line)) {
      const next = (lines[index + 1] ?? "").trim();
      if (/^\s*(?:Sent|Date)\s*:/i.test(next)) break;
    }
    if (/^\s*On\s/i.test(line)) {
      if (/\bwrote\s*:\s*$/i.test(line)) break;
      const next = (lines[index + 1] ?? "").trim();
      if (/\bwrote\s*:\s*$/i.test(next)) break;
    }
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function normalizeSubject(subject: string): string {
  return subject
    .trim()
    .replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

export function matchesFallbackThread(
  candidate: { subject: string; participants: string[] },
  incoming: { subject: string; from: string },
): boolean {
  return normalizeSubject(candidate.subject) === normalizeSubject(incoming.subject) &&
    candidate.participants.includes(incoming.from);
}

export function extractMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.match(/<[^<>\s]+>/g) ?? [];
}

export function extractBounceRecipient(text: string): string | null {
  const match = text.match(
    /(?:final-recipient|original-recipient|x-failed-recipients)\s*:\s*(?:rfc822\s*;\s*)?<?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,})>?/i,
  );
  return match?.[1]?.toLocaleLowerCase("en") ?? null;
}

const BOUNCE_SUBJECT_PHRASES =
  /delivery status notification|undeliver(?:ed|able)|delivery failed|failure notice|returned mail|mail delivery failed/i;

const DSN_HEADER_LINES = /^(?:final-recipient|x-failed-recipients)\s*:/im;

const OUT_OF_OFFICE_PATTERN =
  /\b(?:out of office|automatic reply|auto-reply|away from the office|autoreply)\b/i;

const OPT_OUT_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bremove (?:me|us)\b/i,
  /\btake (?:me|us) off\b/i,
  /\bdo not (?:contact|email|mail)\b/i,
  /\bdon't (?:contact|email|mail)\b/i,
  /\bstop (?:emailing|mailing|sending|contacting)\b/i,
  /\bplease stop\b/i,
  /\bnot interested\b/i,
  /\bno longer interested\b/i,
];

export function classifyMessage(input: {
  from: string;
  subject: string;
  text: string;
}): RuleClassification {
  const sender = input.from.toLocaleLowerCase("en");
  const fullText = `${input.subject}\n${input.text}`.slice(0, 32_000);

  // Bounce detection may use the full text (including quoted history).
  const isBounce =
    /(?:mailer-daemon|mail delivery subsystem|postmaster)/i.test(sender) ||
    BOUNCE_SUBJECT_PHRASES.test(input.subject) ||
    DSN_HEADER_LINES.test(fullText);
  if (isBounce) {
    return {
      category: "bounce",
      urgency: "high",
      summary: "Delivery failure or bounce detected.",
      needsHuman: true,
      isOptOut: false,
      isBounce: true,
    };
  }

  // Every other category is decided from the subject and the sender's new text only.
  const fresh = `${input.subject}\n${stripQuotedText(input.text)}`.slice(0, 32_000);
  const lower = fresh.toLocaleLowerCase("en");

  if (OUT_OF_OFFICE_PATTERN.test(fresh)) {
    return {
      category: "out_of_office",
      urgency: "low",
      summary: "Automatic out-of-office reply.",
      needsHuman: false,
      isOptOut: false,
      isBounce: false,
    };
  }

  if (OPT_OUT_PATTERNS.some((pattern) => pattern.test(fresh))) {
    return {
      category: "opt_out",
      urgency: "high",
      summary: "Contact requested an opt-out.",
      needsHuman: false,
      isOptOut: true,
      isBounce: false,
    };
  }

  const categories: Array<{
    category: RuleClassification["category"];
    pattern: RegExp;
    urgency: RuleClassification["urgency"];
  }> = [
    { category: "payment", pattern: /\b(?:payment|invoice|billing|refund|charged|subscription)\b/i, urgency: "high" },
    { category: "account", pattern: /\b(?:login|sign in|password|account|verification)\b/i, urgency: "normal" },
    { category: "job_report", pattern: /\b(?:job post|job listing|job report|vacancy|listing)\b/i, urgency: "normal" },
    { category: "complaint", pattern: /\b(?:complaint|unacceptable|poor service|problem|issue|scam)\b/i, urgency: "high" },
  ];

  const match = categories.find(({ pattern }) => pattern.test(lower));
  return {
    category: match?.category ?? "general",
    urgency: match?.urgency ?? "normal",
    summary: match
      ? `Message appears related to ${match.category.replace("_", " ")}.`
      : "Message needs review.",
    needsHuman: true,
    isOptOut: false,
    isBounce: false,
  };
}

export type InboundMessageEffects = {
  updateLeadStatus: boolean;
  updateCampaignMessages: boolean;
  notifyAdmins: boolean;
};

/**
 * Decides which outreach side effects an inbound message may trigger.
 * Out-of-office auto-replies are saved with their thread and classification
 * but must not change lead status, campaign messages, or notify admins.
 */
export function inboundMessageEffects(classification: RuleClassification): InboundMessageEffects {
  const isOutOfOffice = classification.category === "out_of_office";
  return {
    updateLeadStatus: !isOutOfOffice,
    updateCampaignMessages: !isOutOfOffice,
    notifyAdmins: !isOutOfOffice && (classification.needsHuman || classification.isOptOut),
  };
}

/**
 * The lead status an inbound (non out-of-office) message moves the lead to.
 * A real reply always clears `no_reply` back to `replied`; an existing
 * do-not-contact flag is never lifted.
 */
export function inboundLeadStatus<T extends string>(
  classification: RuleClassification,
  lead: { status: T; doNotContact: boolean },
): T | "do_not_contact" | "bounced" | "replied" {
  if (classification.category === "out_of_office") return lead.status;
  if (classification.isOptOut) return "do_not_contact";
  if (classification.isBounce) return "bounced";
  return lead.doNotContact ? "do_not_contact" : "replied";
}
