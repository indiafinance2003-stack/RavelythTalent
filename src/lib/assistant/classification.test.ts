import { describe, expect, it } from "vitest";
import {
  classifyMessage,
  extractBounceRecipient,
  extractMessageIds,
  inboundLeadStatus,
  inboundMessageEffects,
  matchesFallbackThread,
  normalizeSubject,
  stripQuotedText,
} from "./classification";

describe("assistant inbox rules", () => {
  it.each([
    { from: "Mailer-Daemon <mailer-daemon@example.test>", subject: "Failure", text: "", category: "bounce" },
    { from: "bounces@example.test", subject: "Delivery Status Notification", text: "550 5.1.1 user unknown", category: "bounce" },
    { from: "person@example.test", subject: "Automatic reply", text: "Out of office until Monday", category: "out_of_office" },
    { from: "person@example.test", subject: "Please unsubscribe", text: "Remove me from this list", category: "opt_out" },
    { from: "person@example.test", subject: "Invoice question", text: "payment did not go through", category: "payment" },
    { from: "person@example.test", subject: "Password problem", text: "I cannot log in to my account", category: "account" },
    { from: "person@example.test", subject: "Listing", text: "I need to report a job post", category: "job_report" },
    { from: "person@example.test", subject: "Complaint", text: "This is unacceptable service", category: "complaint" },
  ])("classifies $category", ({ from, subject, text, category }) => {
    expect(classifyMessage({ from, subject, text }).category).toBe(category);
  });

  it("flags opt-outs for immediate handling without treating them as a bounce", () => {
    expect(classifyMessage({
      from: "person@example.test",
      subject: "Stop",
      text: "Do not contact me again",
    })).toMatchObject({ isOptOut: true, isBounce: false, needsHuman: false });
  });

  it("normalizes reply prefixes and extracts RFC message IDs", () => {
    expect(normalizeSubject(" Re: FWD:  Hiring update ")).toBe("hiring update");
    expect(matchesFallbackThread(
      { subject: "Hiring update", participants: ["person@example.test"] },
      { subject: "Re: FWD: Hiring update", from: "person@example.test" },
    )).toBe(true);
    expect(matchesFallbackThread(
      { subject: "Hiring update", participants: ["other@example.test"] },
      { subject: "Re: Hiring update", from: "person@example.test" },
    )).toBe(false);
    expect(extractMessageIds("<first@example.test> <second@example.test>")).toEqual([
      "<first@example.test>",
      "<second@example.test>",
    ]);
  });

  it("extracts only the destination address from delivery status notifications", () => {
    expect(extractBounceRecipient(
      "Final-Recipient: rfc822; Hiring@Example.test\nAction: failed\nStatus: 5.1.1",
    )).toBe("hiring@example.test");
    expect(extractBounceRecipient("No recipient supplied")).toBeNull();
  });
});

describe("stripQuotedText", () => {
  it("stops at a single-line 'On ... wrote:' header", () => {
    expect(stripQuotedText(
      "Happy to hear more.\n\nOn Mon, 5 Oct 2026 at 10:00 PM, HR Team <hr@example.com> wrote:\nPlease unsubscribe me from this list.",
    )).toBe("Happy to hear more.");
  });

  it("stops when the 'On ... wrote:' header is split over two lines", () => {
    expect(stripQuotedText(
      "Count me in.\nOn Mon, 5 Oct 2026 at 10:00 PM\nHR Team <hr@example.com> wrote:\nTake me off your mailing list.",
    )).toBe("Count me in.");
  });

  it("stops at Original Message, Forwarded message, underscore and Outlook markers", () => {
    expect(stripQuotedText("New text\n-----Original Message-----\nold")).toBe("New text");
    expect(stripQuotedText("New text\n-----Forwarded message-----\nold")).toBe("New text");
    expect(stripQuotedText("New text\n_____\nold")).toBe("New text");
    expect(stripQuotedText(
      "New text\nFrom: Ravelyth <support@ravelyth.in>\nSent: 5 October 2026 10:00\nold",
    )).toBe("New text");
    expect(stripQuotedText(
      "New text\nFrom: Ravelyth <support@ravelyth.in>\nDate: 5 October 2026\nold",
    )).toBe("New text");
  });

  it("skips lines starting with '>' but keeps other new text", () => {
    expect(stripQuotedText("First answer\n> quoted question\nSecond answer"))
      .toBe("First answer\nSecond answer");
  });
});

describe("classifyMessage quoted-text safety", () => {
  it("does not treat a reply that only quotes our opt-out line as an opt-out", () => {
    const result = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: [
        "Thanks for the details.",
        "",
        "On Mon, 5 Oct 2026 at 10:00 PM, Ravelyth Talent <support@ravelyth.in> wrote:",
        "> To unsubscribe or opt out of these emails, reply with unsubscribe.",
        "> We will not contact you again otherwise.",
      ].join("\n"),
    });
    expect(result.category).toBe("general");
    expect(result.isOptOut).toBe(false);
  });

  it("still detects explicit opt-out requests in the new text", () => {
    expect(classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Please unsubscribe me.",
    })).toMatchObject({ category: "opt_out", isOptOut: true, needsHuman: false });
    expect(classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Thanks, not interested.",
    })).toMatchObject({ category: "opt_out", isOptOut: true });
  });

  it("does not treat a bare 'stop' as an opt-out", () => {
    expect(classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Can you stop by next week?",
    })).toMatchObject({ category: "general", isOptOut: false });
  });

  it("classifies out-of-office replies, including 'autoreply'", () => {
    expect(classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "I am out of office until 20 Oct and will reply after that.",
    }).category).toBe("out_of_office");
    expect(classifyMessage({
      from: "hr@example.test",
      subject: "Autoreply: Hiring update",
      text: "This autoreply was generated automatically.",
    }).category).toBe("out_of_office");
  });

  it("classifies real DSN bounces but not ordinary emails containing 5.x.x codes", () => {
    expect(classifyMessage({
      from: "person@example.test",
      subject: "Delivery Status Notification (Failure)",
      text: "Final-Recipient: rfc822; hr@example.test\nAction: failed",
    })).toMatchObject({ category: "bounce", isBounce: true });
    expect(classifyMessage({
      from: "person@example.test",
      subject: "Re: Rates",
      text: "The number 5.1.2 appears in our pricing sheet.",
    })).toMatchObject({ category: "general", isBounce: false });
  });

  it("ignores quoted unsubscribe text after 'On ... wrote:' and '>' lines", () => {
    const result = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: [
        "Interested, please share more.",
        "On Mon, 5 Oct 2026 at 10:00 PM, Ravelyth Talent <support@ravelyth.in> wrote:",
        "> unsubscribe me from this list",
        "> take me off your mailing list",
      ].join("\n"),
    });
    expect(result.isOptOut).toBe(false);
    expect(result.category).toBe("general");
  });
});

describe("inboundMessageEffects", () => {
  it("suppresses lead, campaign and admin effects for out-of-office replies", () => {
    const ooo = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Out of office until Monday.",
    });
    expect(inboundMessageEffects(ooo)).toEqual({
      updateLeadStatus: false,
      updateCampaignMessages: false,
      notifyAdmins: false,
    });
    expect(inboundLeadStatus(ooo, { status: "no_reply", doNotContact: false })).toBe("no_reply");
  });

  it("keeps effects for replies, opt-outs and bounces", () => {
    const reply = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Let us discuss on a call.",
    });
    expect(inboundMessageEffects(reply)).toEqual({
      updateLeadStatus: true,
      updateCampaignMessages: true,
      notifyAdmins: true,
    });
    const optOut = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Do not contact me.",
    });
    expect(inboundMessageEffects(optOut)).toEqual({
      updateLeadStatus: true,
      updateCampaignMessages: true,
      notifyAdmins: true,
    });
  });

  it("moves a no_reply lead back to replied when a real reply arrives", () => {
    const reply = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Yes, tell us more about posting jobs.",
    });
    expect(inboundLeadStatus(reply, { status: "no_reply", doNotContact: false })).toBe("replied");
    expect(inboundLeadStatus(reply, { status: "emailed", doNotContact: false })).toBe("replied");
    expect(inboundLeadStatus(reply, { status: "no_reply", doNotContact: true })).toBe("do_not_contact");
    const optOut = classifyMessage({
      from: "hr@example.test",
      subject: "Re: Hiring update",
      text: "Unsubscribe me.",
    });
    expect(inboundLeadStatus(optOut, { status: "no_reply", doNotContact: false })).toBe("do_not_contact");
    const bounce = classifyMessage({
      from: "mailer-daemon@example.test",
      subject: "Undeliverable",
      text: "",
    });
    expect(inboundLeadStatus(bounce, { status: "no_reply", doNotContact: false })).toBe("bounced");
  });
});
