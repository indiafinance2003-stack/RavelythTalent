import { describe, expect, it } from "vitest";
import {
  CHAT_AUTO_MUTE_MS,
  CHAT_MESSAGE_MAX_LENGTH,
  canViewConversation,
  chatEmailDecision,
  checkMessageBody,
  decideEmployerStart,
  decidePreApplyQuestion,
  decideSendMessage,
  muteUntilFrom,
  sanitizePlainText,
  shouldAutoMute,
  type ChatDecision,
} from "./rules";

function denied(decision: ChatDecision): string {
  if (decision.allowed) throw new Error("expected a denial");
  return decision.code;
}

describe("chat text handling", () => {
  it("strips markup so messages stay plain text", () => {
    expect(sanitizePlainText("<b>Hi</b> <script>x</script>there")).toBe(
      "Hi x there",
    );
  });

  it("rejects empty and over-long bodies", () => {
    expect(denied(checkMessageBody("   "))).toBe("chat_empty_message");
    expect(denied(checkMessageBody("a".repeat(CHAT_MESSAGE_MAX_LENGTH + 1)))).toBe(
      "chat_message_too_long",
    );
    expect(checkMessageBody("a".repeat(CHAT_MESSAGE_MAX_LENGTH)).allowed).toBe(
      true,
    );
  });
});

const basePreApply = {
  globalEnabled: true,
  companyChatEnabled: true,
  companyChatBeforeApplyEnabled: true,
  hasApplication: false,
  hasExistingPreApplyConversation: false,
  blocked: false,
  mutedUntil: null,
  now: new Date("2026-01-01T00:00:00Z"),
  messagesLastHour: 0,
  conversationsToday: 0,
};

describe("pre-application question rules", () => {
  it("allows one question when everything is enabled", () => {
    expect(decidePreApplyQuestion(basePreApply).allowed).toBe(true);
  });

  it("requires the global switch", () => {
    expect(denied(decidePreApplyQuestion({ ...basePreApply, globalEnabled: false }))).toBe(
      "chat_disabled",
    );
  });

  it("honours the employer's chat toggles", () => {
    expect(
      denied(
        decidePreApplyQuestion({ ...basePreApply, companyChatEnabled: false }),
      ),
    ).toBe("chat_disabled");
    expect(
      denied(
        decidePreApplyQuestion({
          ...basePreApply,
          companyChatBeforeApplyEnabled: false,
        }),
      ),
    ).toBe("chat_before_apply_disabled");
  });

  it("applies the apply-first rule", () => {
    expect(
      denied(decidePreApplyQuestion({ ...basePreApply, hasApplication: true })),
    ).toBe("already_applied");
  });

  it("allows only one pre-apply question per job", () => {
    expect(
      denied(
        decidePreApplyQuestion({
          ...basePreApply,
          hasExistingPreApplyConversation: true,
        }),
      ),
    ).toBe("preapply_limit");
  });

  it("blocks blocked and muted senders", () => {
    expect(
      denied(decidePreApplyQuestion({ ...basePreApply, blocked: true })),
    ).toBe("chat_blocked");
    expect(
      denied(
        decidePreApplyQuestion({
          ...basePreApply,
          mutedUntil: new Date("2026-01-01T10:00:00Z"),
        }),
      ),
    ).toBe("chat_muted");
  });

  it("enforces daily conversation and hourly message limits", () => {
    expect(
      denied(
        decidePreApplyQuestion({ ...basePreApply, conversationsToday: 5 }),
      ),
    ).toBe("chat_rate_limited");
    expect(
      denied(decidePreApplyQuestion({ ...basePreApply, messagesLastHour: 20 })),
    ).toBe("chat_rate_limited");
  });
});

const baseEmployerStart = {
  globalEnabled: true,
  companyChatEnabled: true,
  isCompanyMember: true,
  hasApplication: true,
  blocked: false,
  mutedUntil: null,
  now: new Date("2026-01-01T00:00:00Z"),
  messagesLastHour: 0,
};

describe("employer start rules", () => {
  it("allows starting once an application exists", () => {
    expect(decideEmployerStart(baseEmployerStart).allowed).toBe(true);
  });

  it("will not start a conversation before an application exists", () => {
    expect(
      denied(decideEmployerStart({ ...baseEmployerStart, hasApplication: false })),
    ).toBe("employer_cannot_start");
  });

  it("requires membership and the company toggle", () => {
    expect(
      denied(
        decideEmployerStart({ ...baseEmployerStart, isCompanyMember: false }),
      ),
    ).toBe("not_company_member");
    expect(
      denied(
        decideEmployerStart({ ...baseEmployerStart, companyChatEnabled: false }),
      ),
    ).toBe("chat_disabled");
  });
});

const baseSend = {
  globalEnabled: true,
  companyChatEnabled: true,
  senderSide: "employer" as const,
  senderIsParticipant: true,
  conversationPreApply: false,
  hasApplication: true,
  employerHasReplied: false,
  blocked: false,
  mutedUntil: null,
  now: new Date("2026-01-01T00:00:00Z"),
  messagesLastHour: 0,
  bodyLength: 10,
};

describe("send message rules", () => {
  it("allows an ordinary message", () => {
    expect(decideSendMessage(baseSend).allowed).toBe(true);
  });

  it("rejects non-participants", () => {
    expect(
      denied(decideSendMessage({ ...baseSend, senderIsParticipant: false })),
    ).toBe("not_participant");
  });

  it("stops a candidate from sending a second pre-apply message before a reply", () => {
    expect(
      denied(
        decideSendMessage({
          ...baseSend,
          senderSide: "candidate",
          conversationPreApply: true,
          hasApplication: false,
          employerHasReplied: false,
        }),
      ),
    ).toBe("chat_preapply_limit");
    expect(
      decideSendMessage({
        ...baseSend,
        senderSide: "candidate",
        conversationPreApply: true,
        hasApplication: false,
        employerHasReplied: true,
      }).allowed,
    ).toBe(true);
  });

  it("enforces plain-text length limits", () => {
    expect(denied(decideSendMessage({ ...baseSend, bodyLength: 0 }))).toBe(
      "chat_empty_message",
    );
    expect(
      denied(
        decideSendMessage({
          ...baseSend,
          bodyLength: CHAT_MESSAGE_MAX_LENGTH + 1,
        }),
      ),
    ).toBe("chat_message_too_long");
  });

  it("enforces the hourly message limit", () => {
    expect(
      denied(decideSendMessage({ ...baseSend, messagesLastHour: 20 })),
    ).toBe("chat_rate_limited");
  });

  it("blocks blocked and muted senders", () => {
    expect(denied(decideSendMessage({ ...baseSend, blocked: true }))).toBe(
      "chat_blocked",
    );
    expect(
      denied(
        decideSendMessage({
          ...baseSend,
          mutedUntil: new Date("2026-01-01T10:00:00Z"),
        }),
      ),
    ).toBe("chat_muted");
  });
});

describe("conversation authorization", () => {
  it("lets the candidate read their own conversation", () => {
    expect(
      canViewConversation({
        viewerUserId: "candidate-1",
        viewerCompanyIds: [],
        candidateUserId: "candidate-1",
        companyId: "company-1",
        party: "candidate",
      }),
    ).toBe(true);
  });

  it("stops a candidate reading another candidate's conversation", () => {
    expect(
      canViewConversation({
        viewerUserId: "candidate-2",
        viewerCompanyIds: [],
        candidateUserId: "candidate-1",
        companyId: "company-1",
        party: "candidate",
      }),
    ).toBe(false);
  });

  it("stops a company reading another company's conversation", () => {
    expect(
      canViewConversation({
        viewerUserId: "user-1",
        viewerCompanyIds: ["company-2"],
        candidateUserId: "candidate-1",
        companyId: "company-1",
        party: "employer",
      }),
    ).toBe(false);
  });
});

describe("scam auto-mute and email throttling", () => {
  it("auto-mutes after three flagged messages in 24 hours", () => {
    expect(shouldAutoMute(2)).toBe(false);
    expect(shouldAutoMute(3)).toBe(true);
    const now = new Date("2026-01-01T00:00:00Z");
    expect(muteUntilFrom(now).getTime() - now.getTime()).toBe(CHAT_AUTO_MUTE_MS);
  });

  it("sends at most one chat email per conversation per hour", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(chatEmailDecision(null, now)).toBe("send");
    expect(
      chatEmailDecision(new Date("2026-01-01T11:30:00Z"), now),
    ).toBe("skip");
    expect(
      chatEmailDecision(new Date("2026-01-01T11:00:00Z"), now),
    ).toBe("send");
  });
});
