import { z } from "zod";
import { parseRecords } from "./leads-csv";

export const targetInputSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  website: z.string().trim().min(1).max(500),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(160).nullable(),
  source: z.string().trim().max(120).nullable(),
});

export type TargetInput = z.infer<typeof targetInputSchema>;

const HEADER_ALIASES: Record<keyof TargetInput, string[]> = {
  companyName: ["companyname", "company", "organization", "organisation"],
  website: ["website", "companywebsite", "url", "websiteurl"],
  city: ["city", "location"],
  state: ["state", "region"],
  industry: ["industry", "sector"],
  source: ["source", "leadsource"],
};

/** Renders the stored contact-form template with the target's company name. */
export function renderContactFormMessage(template: string, companyName: string): string {
  return template.replace(/\{\{\s*company\s*\}\}/gi, companyName);
}

export type TargetCsvRow = {
  row: number;
  data: (TargetInput & { domain: string }) | null;
  error: string | null;
  /** True when the domain already exists in the database (skipped on import). */
  existing?: boolean;
};

/**
 * Normalizes a website value to a bare lowercase registrable host with no
 * scheme, path, port or leading "www.", e.g. "https://www.Acme.in/careers"
 * becomes "acme.in". Returns "" when the value cannot produce a host.
 */
export function normalizeTargetDomain(website: string): string {
  const trimmed = website.trim();
  if (!trimmed) return "";
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  const host = url.hostname.toLocaleLowerCase("en").replace(/\.$/, "");
  if (!host || host === "localhost") return "";
  return host.replace(/^www\./, "");
}

function normalizedHeader(header: string): string {
  return header.toLocaleLowerCase("en").replace(/[^a-z0-9]/g, "");
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

/**
 * Parses a targets CSV (Company Name, Website, City, State, Industry, Source)
 * with per-row validation and in-file domain dedupe (first row wins).
 */
export function parseTargetCsv(csv: string): TargetCsvRow[] {
  if (new TextEncoder().encode(csv).byteLength > 2_000_000) {
    throw new Error("CSV file must be no larger than 2 MB.");
  }
  const records = parseRecords(csv);
  if (!records.length) return [];
  if (records.length > 1001) throw new Error("CSV may contain at most 1,000 target rows.");

  const headers = records[0]!.map(normalizedHeader);
  const indexes = new Map<keyof TargetInput, number>();
  for (const field of Object.keys(HEADER_ALIASES) as Array<keyof TargetInput>) {
    const index = headers.findIndex((header) => HEADER_ALIASES[field].includes(header));
    if (index >= 0) indexes.set(field, index);
  }
  if (!indexes.has("companyName") || !indexes.has("website")) {
    throw new Error("CSV must include Company Name and Website columns.");
  }

  const seenDomains = new Set<string>();
  return records.slice(1, 1001).map((record, index) => {
    const raw = Object.fromEntries(
      [...indexes].map(([key, column]) => [key, record[column] ?? ""]),
    ) as Record<keyof TargetInput, string>;
    const candidate: TargetInput = {
      companyName: raw.companyName,
      website: raw.website,
      city: nullable(raw.city),
      state: nullable(raw.state),
      industry: nullable(raw.industry),
      source: nullable(raw.source),
    };
    const parsed = targetInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        row: index + 2,
        data: null,
        error: parsed.error.issues[0]?.message ?? "Invalid target row.",
      };
    }
    const domain = normalizeTargetDomain(parsed.data.website);
    if (!domain) {
      return { row: index + 2, data: null, error: "Website must be a valid http(s) address." };
    }
    if (seenDomains.has(domain)) {
      return { row: index + 2, data: null, error: "Duplicate domain in this CSV." };
    }
    seenDomains.add(domain);
    return { row: index + 2, data: { ...parsed.data, domain }, error: null };
  });
}