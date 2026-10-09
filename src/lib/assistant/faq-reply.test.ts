import { describe, expect, it } from "vitest";
import {
  AUTO_REPLY_CATEGORIES,
  autoReplyBlockReasons,
  bestFaqMatch,
  faqTokens,
  FAQ_MATCH_THRESHOLD,
  MIN_SHARED_TOKENS,
  planFaqReply,
  sharedTokenCount,
  tokenSimilarity,
  type FaqReplyCandidate,
} from "./faq-reply";

function faq(overrides: Partial<FaqReplyCandidate> = {}): FaqReplyCandidate {
  return {
    id: "faq-1",
    question: "Do you provide free resume reviews for fresh graduates?",
    answer: "Yes, we offer free resume reviews for fresh graduates.",
    safeToAutoSend: false,
    ...overrides,
  };
}

describe("faqTokens", () => {
  it("strips stopwords, punctuation and short tokens, and dedupes", () => {
    expect(faqTokens("Hi, I would like to reset my password. Reset!")).toEqual([
      "like",
      "reset",
      "password",
    ]);
  });
});

describe("tokenSimilarity and sharedTokenCount", () => {
  it("computes the Dice coefficient with shared-token guard", () => {
    const a = faqTokens("I am a fresh graduate wanting a free resume review");
    const b = faqTokens("Do you provide free resume reviews for fresh graduates");
    expect(sharedTokenCount(a, b)).toBeGreaterThanOrEqual(MIN_SHARED_TOKENS);
    expect(tokenSimilarity(a, b)).toBeGreaterThanOrEqual(FAQ_MATCH_THRESHOLD);
    expect(tokenSimilarity([], ["anything"])).toBe(0);
  });
});

describe("bestFaqMatch", () => {
  it("returns a confident match for a closely related question", () => {
    const match = bestFaqMatch("I am a fresh graduate and I need a free resume review please", [
      faq(),
      faq({ id: "faq-other", question: "Where is my invoice for the annual subscription?" }),
    ]);
    expect(match?.faq.id).toBe("faq-1");
  });

  it("returns null when no FAQ shares enough tokens", () => {
    const match = bestFaqMatch("I want to cancel my subscription and get a refund", [
      faq({ question: "How do I apply for a job on your platform?" }),
    ]);
    expect(match).toBeNull();
  });
});

describe("planFaqReply", () => {
  const message = {
    subject: "Resume review",
    text: "I am a fresh graduate wanting a free resume review of my profile.",
  };

  it("always creates a draft for a confident match, even when auto-send is disabled", () => {
    const plan = planFaqReply({
      ...message,
      faqs: [faq({ safeToAutoSend: true })],
      autoReplySafe: false,
    });
    expect(plan.kind).toBe("draft");
    if (plan.kind === "draft") {
      expect(plan.draftBody).toContain("free resume reviews");
      expect(plan.autoSend).toBe(false);
    }
  });

  it("auto-sends only when both the setting and the FAQ flag are on", () => {
    const plan = planFaqReply({
      ...message,
      faqs: [faq({ safeToAutoSend: true })],
      autoReplySafe: true,
    });
    expect(plan.kind).toBe("draft");
    if (plan.kind === "draft") expect(plan.autoSend).toBe(true);

    const unmarked = planFaqReply({
      ...message,
      faqs: [faq({ safeToAutoSend: false })],
      autoReplySafe: true,
    });
    expect(unmarked.kind).toBe("draft");
    if (unmarked.kind === "draft") expect(unmarked.autoSend).toBe(false);
  });

  it("reports no match when nothing is confident", () => {
    const plan = planFaqReply({
      ...message,
      faqs: [faq({ question: "Where can I track my shipment?" })],
      autoReplySafe: true,
    });
    expect(plan.kind).toBe("no_match");
  });
});

describe("AUTO_REPLY_CATEGORIES", () => {
  it("contains only general and account", () => {
    expect([...AUTO_REPLY_CATEGORIES].sort()).toEqual(["account", "general"]);
  });
});

describe("autoReplyBlockReasons", () => {
  const base = {
    category: "general",
    from: "candidate@example.com",
    suppressed: false,
    paused: false,
    alreadyRepliedInThread: false,
    todayCount: 0,
  };

  it("allows when nothing blocks", () => {
    expect(autoReplyBlockReasons(base)).toEqual([]);
  });

  it("blocks categories outside the safe set", () => {
    expect(autoReplyBlockReasons({ ...base, category: "payment" })).toHaveLength(1);
  });

  it("blocks suppressed senders", () => {
    expect(autoReplyBlockReasons({ ...base, suppressed: true })).toHaveLength(1);
  });

  it("blocks automated senders", () => {
    expect(autoReplyBlockReasons({ ...base, from: "no-reply@example.com" })).toHaveLength(1);
    expect(autoReplyBlockReasons({ ...base, from: "donotreply@automated.example" })).toHaveLength(1);
  });

  it("blocks when sending is paused", () => {
    expect(autoReplyBlockReasons({ ...base, paused: true })[0]).toContain("paused");
  });

  it("blocks a second automatic reply in the same thread", () => {
    expect(autoReplyBlockReasons({ ...base, alreadyRepliedInThread: true })).toHaveLength(1);
  });

  it("blocks when the daily cap is reached", () => {
    expect(autoReplyBlockReasons({ ...base, todayCount: 20 })).toHaveLength(1);
    expect(autoReplyBlockReasons({ ...base, todayCount: 4 })).toEqual([]);
  });
});