import { z } from "zod";

/**
 * Pure form parsing for the outreach campaigns page.
 *
 * These schemas are the single source of truth used by the server actions in
 * `campaign-actions.ts` AND by the unit tests. Keeping them out of the
 * `"use server"` module means the tests exercise exactly the same validation
 * the live action runs, with no database or Next.js request context.
 */

export const ACTIVATION_SELECTION_ERROR =
  "Select a campaign and one or more leads.";

export const campaignIdSchema = z.uuid();

export const campaignFormSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the campaign a name.").max(200),
  senderAccountId: z.enum(["support", "gmail"]),
  subjectTemplate: z.string().trim().min(1).max(998),
  bodyTemplate: z.string().trim().min(1).max(20_000),
  step2Enabled: z.boolean(),
  step2DelayDays: z.coerce.number().int().min(1).max(60),
  step2Subject: z.string().trim().max(998),
  step2Body: z.string().trim().max(20_000),
  step3Enabled: z.boolean(),
  step3DelayDays: z.coerce.number().int().min(1).max(60),
  step3Subject: z.string().trim().max(998),
  step3Body: z.string().trim().max(20_000),
  autoApproveFollowups: z.boolean(),
  followsUpPrevious: z.boolean(),
  minDaysSinceLastContact: z.coerce.number().int().min(2, "The minimum is 2 days.").max(60),
});

export type CampaignFormInput = z.infer<typeof campaignFormSchema>;

function formString(form: FormData, name: string): string {
  return String(form.get(name) ?? "");
}

function formChecked(form: FormData, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true";
}

/** Maps a submitted campaign form to the values accepted by `campaignFormSchema`. */
export function campaignFormValues(form: FormData) {
  return {
    id: formString(form, "id") || undefined,
    name: formString(form, "name"),
    senderAccountId: formString(form, "senderAccountId"),
    subjectTemplate: formString(form, "subjectTemplate"),
    bodyTemplate: formString(form, "bodyTemplate"),
    step2Enabled: formChecked(form, "step2Enabled"),
    step2DelayDays: form.get("step2DelayDays") ?? 3,
    step2Subject: formString(form, "step2Subject"),
    step2Body: formString(form, "step2Body"),
    step3Enabled: formChecked(form, "step3Enabled"),
    step3DelayDays: form.get("step3DelayDays") ?? 7,
    step3Subject: formString(form, "step3Subject"),
    step3Body: formString(form, "step3Body"),
    autoApproveFollowups: formChecked(form, "autoApproveFollowups"),
    followsUpPrevious: formChecked(form, "followsUpPrevious"),
    minDaysSinceLastContact: form.get("minDaysSinceLastContact") ?? 3,
  };
}

export function parseCampaignForm(form: FormData) {
  return campaignFormSchema.safeParse(campaignFormValues(form));
}

export const activationFormSchema = z.object({
  campaignId: campaignIdSchema,
  leadIds: z.array(z.uuid()).min(1, ACTIVATION_SELECTION_ERROR).max(1000),
});

export function parseActivationForm(form: FormData) {
  return activationFormSchema.safeParse({
    campaignId: formString(form, "campaignId") || undefined,
    leadIds: form.getAll("leadIds"),
  });
}

export const deleteCampaignSchema = z.object({
  campaignId: campaignIdSchema,
  confirmName: z.string().trim().min(1, "Type the campaign name to confirm deletion."),
});

export function parseDeleteCampaignForm(form: FormData) {
  return deleteCampaignSchema.safeParse({
    campaignId: formString(form, "campaignId"),
    confirmName: formString(form, "confirmName"),
  });
}

export const duplicateCampaignSchema = z.object({
  campaignId: campaignIdSchema,
});

export function parseDuplicateCampaignForm(form: FormData) {
  return duplicateCampaignSchema.safeParse({
    campaignId: formString(form, "campaignId"),
  });
}
