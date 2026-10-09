import { describe, expect, it } from "vitest";
import {
  campaignActivationBlockReasons,
  campaignDailyLimit,
  campaignLeadBlockReasons,
  hasCampaignSpacing,
  isWithinCampaignWindow,
  outreachBusinessAddress,
  planCampaignStep,
  type PlanCampaignStepInput,
  renderCampaignTemplate,
} from "./campaign-rules";

describe("campaign guards", () => {
  it("blocks invalid, suppressed, opted-out, bounced, rejected, recently emailed, and replied leads", () => {
    expect(campaignLeadBlockReasons({
      email: "x",
      emailValid: false,
      suppressed: true,
      doNotContact: true,
      status: "bounced",
      emailedWithin14Days: true,
      hasReplied: true,
    })).toHaveLength(6);
    expect(campaignLeadBlockReasons({
      email: "x",
      emailValid: true,
      suppressed: false,
      doNotContact: false,
      status: "rejected",
      emailedWithin14Days: false,
      hasReplied: false,
    })).toContain("Lead was rejected.");
  });

  it("blocks a no_reply lead contacted within the last 60 days", () => {
    expect(campaignLeadBlockReasons({
      email: "x",
      emailValid: true,
      suppressed: false,
      doNotContact: false,
      status: "no_reply",
      emailedWithin14Days: false,
      hasReplied: false,
      noReplyContactedWithin60Days: true,
    })).toEqual(["Lead did not reply to a previous full sequence; wait 60 days."]);
    expect(campaignLeadBlockReasons({
      email: "x",
      emailValid: true,
      suppressed: false,
      doNotContact: false,
      status: "no_reply",
      emailedWithin14Days: false,
      hasReplied: false,
    })).toEqual([]);
  });

  it("requires identity, address, and a visible unsubscribe URL before activation", () => {
    expect(campaignActivationBlockReasons({
      legalName: null,
      businessAddress: null,
      bodyTemplate: "Hello",
    })).toHaveLength(4);
    expect(campaignActivationBlockReasons({
      legalName: "Ravelyth",
      businessAddress: "Mumbai",
      bodyTemplate: "Opt out: {{unsubscribe_url}}",
    })).toEqual([]);
  });

  it("does not treat the default country alone as a business address", () => {
    expect(outreachBusinessAddress({
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: "India",
    })).toBe("");
    expect(outreachBusinessAddress({
      addressLine1: "12 Example Road",
      addressLine2: null,
      city: "Pune",
      state: "Maharashtra",
      postalCode: null,
      country: "India",
    })).toBe("12 Example Road, Pune, Maharashtra, India");
  });

  it("renders only approved template variables", () => {
    expect(renderCampaignTemplate("Hi {{contact_name}} at {{company}} {{unknown}}", {
      company: "Acme",
      contact_name: "Riya",
      designation: "HR",
      city: "Pune",
      unsubscribe_url: "https://example.test/u",
    })).toBe("Hi Riya at Acme {{unknown}}");
  });

  it("limits daily cap and enforces IST Monday-to-Saturday window and spacing", () => {
    expect(campaignDailyLimit(100)).toBe(40);
    expect(campaignDailyLimit(-5)).toBe(0);
    expect(isWithinCampaignWindow(new Date("2026-10-05T05:00:00Z"), "10:00", "17:00")).toBe(true);
    expect(isWithinCampaignWindow(new Date("2026-10-04T05:00:00Z"), "10:00", "17:00")).toBe(false);
    expect(isWithinCampaignWindow(new Date("2026-10-05T03:00:00Z"), "10:00", "17:00")).toBe(false);
    expect(hasCampaignSpacing(new Date(100_000), new Date(0), 2)).toBe(false);
    expect(hasCampaignSpacing(new Date(120_000), new Date(0), 2)).toBe(true);
  });
});

describe("planCampaignStep", () => {
  const now = new Date("2026-10-08T04:00:00.000Z");
  const base: PlanCampaignStepInput = {
    now,
    email: "hr@example.test",
    emailValid: true,
    suppressed: false,
    doNotContact: false,
    status: "new",
    lastContactedAt: null,
    hasReplied: false,
    emailedWithin14Days: false,
    hasSentCampaignMessage: false,
    followupSequence: [
      { delayDays: 3, subject: "Follow-up one", body: "Body one", enabled: true },
      { delayDays: 4, subject: "Follow-up two", body: "Body two", enabled: true },
    ],
  };
  const importedLastContact = new Date("2026-10-07T06:30:00.000Z"); // 12:00 noon IST

  it("plans step 1 scheduled now for a fresh lead", () => {
    const plan = planCampaignStep(base);
    expect(plan).toEqual({ action: "first_email", step: 1, scheduledAt: now });
  });

  it("plans step 2 for an outside-emailed lead, scheduled from last contact plus delay", () => {
    const plan = planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      emailedWithin14Days: true, // must be ignored for outside-emailed leads
    });
    expect(plan.action).toBe("followup");
    expect(plan).toEqual({
      action: "followup",
      step: 2,
      scheduledAt: new Date(importedLastContact.getTime() + 3 * 24 * 60 * 60 * 1000),
    });
  });

  it("schedules the step 2 follow-up at now when last contact plus delay already passed", () => {
    const plan = planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: new Date("2026-09-01T06:30:00.000Z"),
    });
    expect(plan).toEqual({ action: "followup", step: 2, scheduledAt: now });
  });

  it("keeps blocking recently emailed leads that were not imported as outside contact", () => {
    const plan = planCampaignStep({
      ...base,
      status: "new",
      emailedWithin14Days: true,
    });
    expect(plan.action).toBe("blocked");
    expect(plan).toEqual(expect.objectContaining({
      reasons: ["Lead was emailed in the last 14 days."],
    }));
  });

  it("blocks imported leads that replied, are suppressed, or opted out", () => {
    expect(planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      hasReplied: true,
    })).toEqual(expect.objectContaining({
      action: "blocked",
      reasons: ["Lead has replied."],
    }));
    expect(planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      suppressed: true,
    })).toEqual(expect.objectContaining({
      action: "blocked",
      reasons: ["Address is on the suppression list."],
    }));
    expect(planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      doNotContact: true,
    })).toEqual(expect.objectContaining({
      action: "blocked",
      reasons: ["Lead opted out."],
    }));
  });

  it("skips an outside-emailed lead when follow-up step 1 is not enabled", () => {
    const plan = planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      followupSequence: [
        { delayDays: 3, subject: "Follow-up one", body: "Body one", enabled: false },
        { delayDays: 4, subject: "Follow-up two", body: "Body two", enabled: true },
      ],
    });
    expect(plan.action).toBe("skipped");
    expect(plan).toEqual(expect.objectContaining({
      reason: expect.stringContaining("Follow-up step 1 is not enabled"),
    }));
  });

  it("does not treat a lead with an in-system sent message as outside-emailed", () => {
    const plan = planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: importedLastContact,
      hasSentCampaignMessage: true,
      emailedWithin14Days: true,
    });
    expect(plan.action).toBe("blocked");
    expect(plan).toEqual(expect.objectContaining({
      reasons: ["Lead was emailed in the last 14 days."],
    }));
  });

  it("treats an emailed status without lastContactedAt as a normal first email", () => {
    const plan = planCampaignStep({
      ...base,
      status: "emailed",
      lastContactedAt: null,
    });
    expect(plan).toEqual({ action: "first_email", step: 1, scheduledAt: now });
  });

  it("blocks a no_reply lead whose last contact is within 60 days", () => {
    const plan = planCampaignStep({
      ...base,
      status: "no_reply",
      lastContactedAt: new Date("2026-09-20T06:30:00.000Z"), // 18 days ago
    });
    expect(plan).toEqual(expect.objectContaining({
      action: "blocked",
      reasons: ["Lead did not reply to a previous full sequence; wait 60 days."],
    }));
  });

  it("lets a no_reply lead start a new sequence after the 60-day wait", () => {
    const plan = planCampaignStep({
      ...base,
      status: "no_reply",
      lastContactedAt: new Date("2026-07-01T06:30:00.000Z"), // > 60 days ago
    });
    expect(plan).toEqual({ action: "first_email", step: 1, scheduledAt: now });
  });
});
