import { describe, expect, it } from "vitest";
import {
  campaignActivationBlockReasons,
  campaignDailyLimit,
  campaignLeadBlockReasons,
  hasCampaignSpacing,
  isWithinCampaignWindow,
  outreachBusinessAddress,
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
