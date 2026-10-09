import { describe, expect, it } from "vitest";
import { shouldMarkNoReply, type NoReplyLeadState } from "./no-reply";

describe("shouldMarkNoReply", () => {
  const now = new Date("2026-10-08T06:00:00.000Z");
  const base: NoReplyLeadState = {
    leadId: "11111111-1111-4111-8111-111111111111",
    status: "emailed",
    lastSentAt: new Date("2026-10-04T06:00:00.000Z"), // 4 days ago
    hasPendingMessages: false,
    hasInboundMessage: false,
    doNotContact: false,
  };

  it("marks an emailed lead with a finished sequence and no reply after the threshold", () => {
    expect(shouldMarkNoReply(base, now, 3)).toBe(true);
  });

  it("does not mark before the configured number of days has passed", () => {
    expect(shouldMarkNoReply({ ...base, lastSentAt: new Date("2026-10-06T06:00:00.000Z") }, now, 3))
      .toBe(false);
    expect(shouldMarkNoReply({ ...base, lastSentAt: new Date("2026-10-05T06:00:00.000Z") }, now, 3))
      .toBe(true);
  });

  it("does not mark leads that still have pending, approved, queued or sending messages", () => {
    expect(shouldMarkNoReply({ ...base, hasPendingMessages: true }, now, 3)).toBe(false);
  });

  it("does not mark leads with any inbound message", () => {
    expect(shouldMarkNoReply({ ...base, hasInboundMessage: true }, now, 3)).toBe(false);
  });

  it("does not mark opted-out leads or leads without a sent campaign message", () => {
    expect(shouldMarkNoReply({ ...base, doNotContact: true }, now, 3)).toBe(false);
    expect(shouldMarkNoReply({ ...base, lastSentAt: null }, now, 3)).toBe(false);
  });

  it("only considers leads whose status is emailed", () => {
    expect(shouldMarkNoReply({ ...base, status: "new" }, now, 3)).toBe(false);
    expect(shouldMarkNoReply({ ...base, status: "replied" }, now, 3)).toBe(false);
    expect(shouldMarkNoReply({ ...base, status: "no_reply" }, now, 3)).toBe(false);
  });
});