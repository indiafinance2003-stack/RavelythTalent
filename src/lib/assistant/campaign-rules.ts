export type CampaignLeadState = {
  email: string;
  status: string;
  doNotContact: boolean;
  suppressed: boolean;
  emailValid: boolean;
  emailedWithin14Days: boolean;
  hasReplied: boolean;
  noReplyContactedWithin60Days?: boolean;
};

export function campaignLeadBlockReasons(lead: CampaignLeadState): string[] {
  const reasons: string[] = [];
  if (!lead.emailValid) reasons.push("Lead email is invalid.");
  if (lead.suppressed) reasons.push("Address is on the suppression list.");
  if (lead.doNotContact || lead.status === "do_not_contact") reasons.push("Lead opted out.");
  if (lead.status === "bounced") reasons.push("Address previously bounced.");
  if (lead.status === "rejected") reasons.push("Lead was rejected.");
  if (lead.emailedWithin14Days) reasons.push("Lead was emailed in the last 14 days.");
  if (lead.noReplyContactedWithin60Days) {
    reasons.push("Lead did not reply to a previous full sequence; wait 60 days.");
  }
  if (lead.hasReplied) reasons.push("Lead has replied.");
  return reasons;
}

export type PlanCampaignStepInput = {
  now: Date;
  email: string;
  emailValid: boolean;
  suppressed: boolean;
  doNotContact: boolean;
  status: string;
  lastContactedAt: Date | null;
  hasReplied: boolean;
  emailedWithin14Days: boolean;
  hasSentCampaignMessage: boolean;
  followupSequence: Array<{ delayDays: number; subject: string; body: string; enabled: boolean }>;
};

export type CampaignStepPlan =
  | { action: "blocked"; reasons: string[] }
  | { action: "skipped"; reason: string }
  | { action: "first_email"; step: 1; scheduledAt: Date }
  | { action: "followup"; step: 2; scheduledAt: Date };

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_REPLY_WAIT_DAYS = 60;

/**
 * Decides which campaign message (if any) a lead should receive when a draft
 * campaign is activated.
 *
 * A lead counts as "already emailed outside the system" when its status is
 * `emailed`, `lastContactedAt` is set and it has no `sent` campaign message.
 * Such leads skip the first email entirely: they get step 2 built from
 * `followupSequence[0]`, scheduled at max(now, lastContactedAt + delayDays),
 * and the 14-day recency rule does not block them. Every other lead keeps the
 * existing behaviour (step 1, scheduled now). `no_reply` leads are blocked
 * while their last contact is within the 60-day waiting window.
 */
export function planCampaignStep(input: PlanCampaignStepInput): CampaignStepPlan {
  const emailedOutsideSystem =
    input.status === "emailed" &&
    input.lastContactedAt !== null &&
    !input.hasSentCampaignMessage;

  const reasons = campaignLeadBlockReasons({
    email: input.email,
    emailValid: input.emailValid,
    suppressed: input.suppressed,
    doNotContact: input.doNotContact,
    status: input.status,
    emailedWithin14Days: emailedOutsideSystem ? false : input.emailedWithin14Days,
    hasReplied: input.hasReplied,
    noReplyContactedWithin60Days: input.status === "no_reply" &&
      input.lastContactedAt !== null &&
      input.lastContactedAt.getTime() > input.now.getTime() - NO_REPLY_WAIT_DAYS * DAY_MS,
  });
  if (reasons.length) return { action: "blocked", reasons };

  if (emailedOutsideSystem) {
    const firstFollowup = input.followupSequence[0];
    if (!firstFollowup || !firstFollowup.enabled) {
      return {
        action: "skipped",
        reason: "Follow-up step 1 is not enabled for a lead already contacted outside the system.",
      };
    }
    const lastContactedAt = input.lastContactedAt as Date;
    const fromLastContact = new Date(lastContactedAt.getTime() + firstFollowup.delayDays * DAY_MS);
    const scheduledAt = fromLastContact.getTime() > input.now.getTime()
      ? fromLastContact
      : input.now;
    return { action: "followup", step: 2, scheduledAt };
  }

  return { action: "first_email", step: 1, scheduledAt: input.now };
}

export function campaignActivationBlockReasons(input: {
  legalName: string | null;
  businessAddress: string | null;
  bodyTemplate: string;
  requireUnsubscribePlaceholder?: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.legalName?.trim()) reasons.push("Configure the legal business name in site settings.");
  if (!input.businessAddress?.trim()) reasons.push("Configure the business address in site settings.");
  if (!/\b(?:unsubscribe|opt[ -]?out|do not contact)\b/i.test(input.bodyTemplate)) {
    reasons.push("The email body must contain a visible opt-out line.");
  }
  if (input.requireUnsubscribePlaceholder !== false &&
    !/\{\{\s*unsubscribe_url\s*\}\}/i.test(input.bodyTemplate)) {
    reasons.push("The opt-out line must include {{unsubscribe_url}}.");
  }
  if (input.requireUnsubscribePlaceholder === false &&
    !/https?:\/\/[^\s]+\/api\/unsubscribe\/[A-Za-z0-9_.-]+/i.test(input.bodyTemplate)) {
    reasons.push("The opt-out line must include a valid unsubscribe URL.");
  }
  return reasons;
}

export function outreachBusinessAddress(input: {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): string {
  const primary = [
    input.addressLine1,
    input.addressLine2,
    input.city,
    input.state,
    input.postalCode,
  ].filter((part): part is string => Boolean(part?.trim()));
  if (!primary.length) return "";
  if (input.country?.trim()) primary.push(input.country.trim());
  return primary.join(", ");
}

export function renderCampaignTemplate(
  template: string,
  values: {
    company: string;
    contact_name: string;
    designation: string;
    city: string;
    unsubscribe_url: string;
  },
): string {
  return template.replace(
    /\{\{\s*(company|contact_name|designation|city|unsubscribe_url)\s*\}\}/gi,
    (_match, key: string) => values[key.toLocaleLowerCase("en") as keyof typeof values] ?? "",
  );
}

function istParts(date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isWithinCampaignWindow(
  date: Date,
  start: string,
  end: string,
): boolean {
  const from = parseTime(start);
  const to = parseTime(end);
  if (from === null || to === null || from >= to) return false;
  const parts = istParts(date);
  return parts.weekday !== "Sun" && parts.minutes >= from && parts.minutes < to;
}

export function campaignDailyLimit(configuredCap: number): number {
  return Math.max(0, Math.min(40, Math.floor(configuredCap)));
}

export function hasCampaignSpacing(
  now: Date,
  lastSentAt: Date | null,
  requiredMinutes: number,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= requiredMinutes * 60_000;
}
