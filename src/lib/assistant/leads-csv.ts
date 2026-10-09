import { z } from "zod";

export const leadStatuses = [
  "new",
  "emailed",
  "replied",
  "interested",
  "subscribed",
  "rejected",
  "bounced",
  "no_reply",
  "do_not_contact",
] as const;

export type LeadStatusValue = (typeof leadStatuses)[number];

export const leadInputSchema = z.object({
  company: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).nullable(),
  designation: z.string().trim().max(200).nullable(),
  email: z.email().transform((email) => email.toLocaleLowerCase("en")),
  phone: z.string().trim().max(80).nullable(),
  website: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(160).nullable(),
  source: z.string().trim().max(120).nullable(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

const HEADER_ALIASES: Record<keyof LeadInput, string[]> = {
  company: ["company", "companyname", "organization", "organisation"],
  contactName: ["contactname", "contactperson", "name"],
  designation: ["designation", "contactdesignation", "title"],
  email: ["email", "contactemail", "emailaddress"],
  phone: ["phone", "contactphone", "phonenumber"],
  website: ["website", "companywebsite", "url"],
  city: ["city", "location"],
  state: ["state", "region"],
  industry: ["industry", "sector"],
  source: ["source", "leadsource"],
};

export type LeadCsvHistory = {
  status: LeadStatusValue | null;
  lastContactedAt: Date | null;
};

export type LeadCsvRow = {
  row: number;
  data: LeadInput | null;
  error: string | null;
  /** Present only when the CSV contains the optional history columns. */
  history?: LeadCsvHistory;
};

const STATUS_HEADERS = ["status", "outreachstatus", "leadstatus"];
const LAST_CONTACTED_HEADERS = [
  "lastcontacted",
  "lastcontacteddate",
  "emailsentdate",
  "sentdate",
  "dateemailed",
];

const STATUS_TEXT_ALIASES: Record<string, LeadStatusValue> = {
  "email sent": "emailed",
  emailed: "emailed",
  sent: "emailed",
  contacted: "emailed",
  "not contacted": "new",
  new: "new",
  "not emailed": "new",
  replied: "replied",
  interested: "interested",
  subscribed: "subscribed",
  rejected: "rejected",
  bounced: "bounced",
  "no reply": "no_reply",
  "no response": "no_reply",
  "do not contact": "do_not_contact",
  unsubscribed: "do_not_contact",
  "opted out": "do_not_contact",
};

function mapLeadStatusText(value: string): LeadStatusValue | null {
  const key = value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return STATUS_TEXT_ALIASES[key] ?? null;
}

/** Parses a Last Contacted value into 12:00 noon IST, or null when invalid. */
function parseHistoryDate(value: string): Date | null {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  const dmySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const dmyDash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(trimmed);
  const dmyDot = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmySlash || dmyDash || dmyDot) {
    const match = dmySlash ?? dmyDash ?? dmyDot!;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) return null;
  // 12:00 IST is 06:30 UTC.
  return new Date(Date.UTC(year, month - 1, day, 6, 30));
}

export function parseRecords(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]!;
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}

function normalizedHeader(header: string): string {
  return header.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function parseLeadCsv(csv: string): LeadCsvRow[] {
  if (new TextEncoder().encode(csv).byteLength > 2_000_000) {
    throw new Error("CSV file must be no larger than 2 MB.");
  }
  const records = parseRecords(csv);
  if (!records.length) return [];
  if (records.length > 1001) throw new Error("CSV may contain at most 1,000 lead rows.");

  const headers = records[0]!.map(normalizedHeader);
  const indexes = new Map<keyof LeadInput, number>();
  for (const field of Object.keys(HEADER_ALIASES) as Array<keyof LeadInput>) {
    const index = headers.findIndex((header) => HEADER_ALIASES[field].includes(header));
    if (index >= 0) indexes.set(field, index);
  }
  if (!indexes.has("company") || !indexes.has("email")) {
    throw new Error("CSV must include Company Name and Contact Email columns.");
  }

  const seenEmails = new Set<string>();
  const statusColumn = headers.findIndex((header) => STATUS_HEADERS.includes(header));
  const lastContactedColumn = headers.findIndex((header) => LAST_CONTACTED_HEADERS.includes(header));
  const hasHistoryColumns = statusColumn >= 0 || lastContactedColumn >= 0;
  return records.slice(1, 1001).map((record, index) => {
    const raw = Object.fromEntries(
      [...indexes].map(([key, column]) => [key, record[column] ?? ""]),
    ) as Record<keyof LeadInput, string>;
    const candidate = {
      company: raw.company,
      contactName: nullable(raw.contactName),
      designation: nullable(raw.designation),
      email: raw.email.trim(),
      phone: nullable(raw.phone),
      website: nullable(raw.website),
      city: nullable(raw.city),
      state: nullable(raw.state),
      industry: nullable(raw.industry),
      source: nullable(raw.source),
    };
    const parsed = leadInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        row: index + 2,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid lead row.",
      };
    }
    if (seenEmails.has(parsed.data.email)) {
      return { row: index + 2, data: null, error: "Duplicate email in this CSV." };
    }
    seenEmails.add(parsed.data.email);
    if (!hasHistoryColumns) return { row: index + 2, data: parsed.data, error: null };

    const rawStatus = statusColumn >= 0 ? (record[statusColumn] ?? "").trim() : "";
    const rawDate = lastContactedColumn >= 0 ? (record[lastContactedColumn] ?? "").trim() : "";
    const mappedStatus = rawStatus ? mapLeadStatusText(rawStatus) : null;
    let lastContactedAt: Date | null = null;
    if (rawDate) {
      lastContactedAt = parseHistoryDate(rawDate);
      if (!lastContactedAt) {
        return {
          row: index + 2,
          data: null,
          error: "Last Contacted must be a date like 07/10/2026 or 2026-10-07.",
        };
      }
    }
    if (mappedStatus === "emailed" && !lastContactedAt) {
      return {
        row: index + 2,
        data: null,
        error: "Rows marked as emailed need a Last Contacted date.",
      };
    }
    const status: LeadStatusValue | null = mappedStatus ?? (lastContactedAt ? "emailed" : null);
    return {
      row: index + 2,
      data: parsed.data,
      error: null,
      history: { status, lastContactedAt },
    };
  });
}
