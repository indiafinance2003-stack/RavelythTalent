import { describe, expect, it } from "vitest";
import {
  ACTIVATION_SELECTION_ERROR,
  parseActivationForm,
  parseCampaignForm,
  parseDeleteCampaignForm,
  parseDuplicateCampaignForm,
} from "./campaign-form";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";

function baseCampaignForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values: Record<string, string> = {
    name: "Q4 outreach",
    senderAccountId: "gmail",
    subjectTemplate: "A role at {{company}}",
    bodyTemplate: "Hi {{contact_name}}, opt out: {{unsubscribe_url}}",
    step2DelayDays: "3",
    step3DelayDays: "7",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("parseCampaignForm", () => {
  it("accepts a minimal valid campaign and applies safe defaults", () => {
    const parsed = parseCampaignForm(baseCampaignForm());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.id).toBeUndefined();
    expect(parsed.data.step2Enabled).toBe(false);
    expect(parsed.data.step3Enabled).toBe(false);
    expect(parsed.data.autoApproveFollowups).toBe(false);
    expect(parsed.data.followsUpPrevious).toBe(false);
    expect(parsed.data.minDaysSinceLastContact).toBe(3);
  });

  it("reads checkbox and follow-up mode fields", () => {
    const parsed = parseCampaignForm(baseCampaignForm({
      step2Enabled: "on",
      autoApproveFollowups: "on",
      followsUpPrevious: "true",
      minDaysSinceLastContact: "5",
    }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.step2Enabled).toBe(true);
    expect(parsed.data.autoApproveFollowups).toBe(true);
    expect(parsed.data.followsUpPrevious).toBe(true);
    expect(parsed.data.minDaysSinceLastContact).toBe(5);
  });

  it("rejects a missing name and a minimum below 2 days", () => {
    expect(parseCampaignForm(baseCampaignForm({ name: "   " })).success).toBe(false);
    const parsed = parseCampaignForm(baseCampaignForm({ minDaysSinceLastContact: "1" }));
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe("The minimum is 2 days.");
  });
});

describe("parseActivationForm", () => {
  it("rejects a selection with no leads using the shared message", () => {
    const form = new FormData();
    form.set("campaignId", CAMPAIGN_ID);
    const parsed = parseActivationForm(form);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((issue) => issue.message === ACTIVATION_SELECTION_ERROR)).toBe(true);
  });

  it("rejects an invalid campaign id", () => {
    const form = new FormData();
    form.set("campaignId", "not-a-uuid");
    form.append("leadIds", LEAD_ID);
    expect(parseActivationForm(form).success).toBe(false);
  });

  it("accepts a campaign with at least one valid lead", () => {
    const form = new FormData();
    form.set("campaignId", CAMPAIGN_ID);
    form.append("leadIds", LEAD_ID);
    const parsed = parseActivationForm(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.leadIds).toEqual([LEAD_ID]);
  });
});

describe("delete and duplicate parsers", () => {
  it("requires a typed confirmation name for delete", () => {
    const form = new FormData();
    form.set("campaignId", CAMPAIGN_ID);
    expect(parseDeleteCampaignForm(form).success).toBe(false);
    form.set("confirmName", "Q4 outreach");
    const parsed = parseDeleteCampaignForm(form);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.confirmName).toBe("Q4 outreach");
  });

  it("accepts a campaign id for duplicate", () => {
    const form = new FormData();
    form.set("campaignId", CAMPAIGN_ID);
    expect(parseDuplicateCampaignForm(form).success).toBe(true);
    form.set("campaignId", "nope");
    expect(parseDuplicateCampaignForm(form).success).toBe(false);
  });
});
