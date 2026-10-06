import { describe, expect, it } from "vitest";
import { FALLBACK_SETTINGS } from "@/lib/settings";
import {
  defaultPrivacySections,
  defaultRefundSections,
  defaultTermsSections,
} from "./default-policies";

describe("default legal policy text", () => {
  it("covers privacy collection, sharing, rights, children and DPDP requests without placeholder contacts", () => {
    const text = defaultPrivacySections(FALLBACK_SETTINGS)
      .map((section) => `${section.heading} ${section.body}`)
      .join(" ");
    for (const required of [
      "resumes",
      "payment references",
      "logs",
      "cookies",
      "Razorpay",
      "hosting",
      "access to, correction of, or deletion",
      "children under 18",
      "Digital Personal Data Protection Act, 2023",
      "/contact",
    ]) {
      expect(text).toContain(required);
    }
    expect(text).not.toContain("support address configured");
  });

  it("includes the required platform, employer, plan, premium, liability and termination terms", () => {
    const text = defaultTermsSections(FALLBACK_SETTINGS)
      .map((section) => `${section.heading} ${section.body}`)
      .join(" ");
    for (const required of [
      "intermediary",
      "not an employer",
      "never charge candidates any fee",
      "pause or remove a job post",
      "social media channels, free of charge",
      "one free job post",
      "do not automatically renew",
      "Candidate Premium",
      "Limitation of liability",
      "Confidentiality and data protection",
      "Termination",
      "courts in India",
    ]) {
      expect(text).toContain(required);
    }
  });

  it("uses configured jurisdiction and contacts and states the exact refund exceptions", () => {
    const settings = {
      ...FALLBACK_SETTINGS,
      supportEmail: "help@example.test",
      contactPhone: "+91 90000 00000",
      jurisdictionCity: "Bengaluru",
    };
    const terms = defaultTermsSections(settings);
    expect(terms.find((section) => section.heading === "Governing law and courts")?.body)
      .toContain("Bengaluru, India");
    expect(terms.find((section) => section.heading === "Grievance officer")?.body)
      .toContain("help@example.test");
    const refundText = defaultRefundSections(settings)
      .map((section) => section.body)
      .join(" ");
    expect(refundText).toContain("duplicate charges");
    expect(refundText).toContain("within 7 working days");
    expect(refundText).toContain("no automatic debit");
  });
});
