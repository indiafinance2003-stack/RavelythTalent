import { describe, expect, it } from "vitest";
import {
  classifyMessage,
  extractBounceRecipient,
  extractMessageIds,
  matchesFallbackThread,
  normalizeSubject,
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
