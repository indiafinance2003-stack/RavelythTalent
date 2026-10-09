import { stripQuotedText } from "./classification";

/**
 * Task B - safe automatic FAQ replies.
 *
 * Matching is deterministic, rule-based and fully documented so admins can
 * reason about every auto-reply. Confidence is the Dice coefficient
 * (2 * shared / (|A| + |B|)) between the significant word tokens of the
 * sender's NEW text (quoted history removed) and each FAQ question.
 *
 * A match is "confident" only when:
 *   - at least MIN_SHARED_TOKENS significant tokens are shared, and
 *   - tokenSimilarity(tokens, faqQuestionTokens) >= FAQ_MATCH_THRESHOLD
 *
 * A confident match ALWAYS creates a draft. It may be auto-sent only when the
 * shared setting is on AND the matched FAQ is explicitly marked safe to
 * auto-send AND none of the autoReplyBlockReasons conditions block it.
 */

export const FAQ_MATCH_THRESHOLD = 0.4;
export const MIN_SHARED_TOKENS = 2;
export const AUTO_REPLY_DAILY_CAP = 20;

/** Categories that may receive an automatic FAQ reply. */
export const AUTO_REPLY_CATEGORIES = new Set(["general", "account"]);

/** High-frequency English words that add no signal to keyword matching. */
export const FAQ_STOPWORDS = new Set([
  "the", "and", "for", "are", "you", "your", "our", "with", "have", "has",
  "this", "that", "from", "not", "can", "will", "was", "were", "would",
  "should", "could", "about", "into", "what", "when", "where", "which",
  "there", "their", "them", "they", "please", "thank", "hello", "hi",
  "dear", "just", "want", "need", "know", "let", "also", "how", "why",
  "all", "any", "been", "did", "does", "doing", "get", "got", "had", "has",
  "its", "ours", "well", "yes", "no", "if", "then", "than", "so", "such",
]);

export function faqTokens(text: string): string[] {
  const tokens = text
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !FAQ_STOPWORDS.has(token));
  return [...new Set(tokens)];
}

export function sharedTokenCount(a: string[], b: string[]): number {
  const setB = new Set(b);
  return new Set(a).size === 0 ? 0 : [...new Set(a)].filter((token) => setB.has(token)).length;
}

/** Dice coefficient on significant token sets: 2*|A∩B| / (|A| + |B|). */
export function tokenSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) return 0;
  const shared = [...setA].filter((token) => setB.has(token)).length;
  return (2 * shared) / (setA.size + setB.size);
}

export type FaqReplyCandidate = {
  id?: string;
  question: string;
  answer: string;
  safeToAutoSend: boolean;
};

export function bestFaqMatch<T extends FaqReplyCandidate>(
  freshText: string,
  faqs: T[],
): { faq: T; score: number; shared: number } | null {
  const tokens = faqTokens(freshText);
  let best: { faq: T; score: number; shared: number } | null = null;
  for (const faq of faqs) {
    const questionTokens = faqTokens(faq.question);
    const shared = sharedTokenCount(tokens, questionTokens);
    if (shared < MIN_SHARED_TOKENS) continue;
    const score = tokenSimilarity(tokens, questionTokens);
    if (score >= FAQ_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { faq, score, shared };
    }
  }
  return best;
}

export type FaqReplyPlan =
  | { kind: "no_match"; reason: string }
  | { kind: "draft"; faqId: string; score: number; shared: number; draftBody: string; autoSend: boolean };

export function planFaqReply<T extends FaqReplyCandidate>(input: {
  subject: string;
  text: string;
  faqs: T[];
  autoReplySafe: boolean;
}): FaqReplyPlan {
  const fresh = `${input.subject}\n${stripQuotedText(input.text)}`.slice(0, 32_000);
  const match = bestFaqMatch(fresh, input.faqs);
  if (!match) {
    return { kind: "no_match", reason: "No FAQ entry matched confidently. Thread kept for human review." };
  }
  return {
    kind: "draft",
    faqId: match.faq.id ?? "",
    score: match.score,
    shared: match.shared,
    draftBody: match.faq.answer.trim(),
    autoSend: input.autoReplySafe && match.faq.safeToAutoSend,
  };
}

/**
 * Task B2 - gate an automatic reply once a draft exists.
 *
 * Every returned reason means the thread stays awaiting human review. The
 * pause switch is a first-class condition: a paused assistant never auto-sends
 * a reply, even for confident safe matches.
 */
export function autoReplyBlockReasons(input: {
  category: string;
  from: string;
  suppressed: boolean;
  paused: boolean;
  alreadyRepliedInThread: boolean;
  todayCount: number;
}): string[] {
  if (!AUTO_REPLY_CATEGORIES.has(input.category)) {
    return ["Category is not safe for automatic replies."];
  }
  if (input.suppressed) return ["Sender address is on the suppression list."];
  if (/(?:automated|no-?reply|do-?not-?reply|notification|mailer|mailing-list)/i.test(input.from)) {
    return ["Sender looks like an automated notification, not a person."];
  }
  if (input.paused) return ["All sending is paused."];
  if (input.alreadyRepliedInThread) return ["This thread already received an automatic reply."];
  if (input.todayCount >= AUTO_REPLY_DAILY_CAP) {
    return [`The automatic-reply daily cap of ${AUTO_REPLY_DAILY_CAP} was reached.`];
  }
  return [];
}