export type RuleClassification = {
  category: "bounce" | "out_of_office" | "opt_out" | "payment" | "account" | "job_report" | "complaint" | "general";
  urgency: "high" | "normal" | "low";
  summary: string;
  needsHuman: boolean;
  isOptOut: boolean;
  isBounce: boolean;
};

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

export function classifyMessage(input: {
  from: string;
  subject: string;
  text: string;
}): RuleClassification {
  const haystack = `${input.subject}\n${input.text}`.slice(0, 32_000);
  const lower = haystack.toLocaleLowerCase("en");
  const sender = input.from.toLocaleLowerCase("en");

  const isBounce =
    /(?:mailer-daemon|mail delivery subsystem|postmaster)/i.test(sender) ||
    /delivery status notification|undeliver(?:ed|able)|failure notice|returned mail/i.test(lower) ||
    /\b5\.\d{1,3}\.\d{1,3}\b/.test(lower);
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

  if (/\b(?:out of office|automatic reply|auto-reply|away from the office)\b/i.test(lower)) {
    return {
      category: "out_of_office",
      urgency: "low",
      summary: "Automatic out-of-office reply.",
      needsHuman: false,
      isOptOut: false,
      isBounce: false,
    };
  }

  if (/\b(?:unsubscribe|stop|remove me|do not contact|don't contact|not interested)\b/i.test(lower)) {
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
