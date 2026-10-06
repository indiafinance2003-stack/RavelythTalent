import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

export function normalizeCompanyName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeWebsiteDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function normalizeContactPhone(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export async function assertCompanyIdentityAvailable(identity: {
  normalizedName: string;
  websiteDomain: string | null;
  normalizedContactPhone: string | null;
}, exceptCompanyId?: string): Promise<void> {
  const conditions = [
    eq(companies.normalizedName, identity.normalizedName),
    ...(identity.websiteDomain ? [eq(companies.websiteDomain, identity.websiteDomain)] : []),
    ...(identity.normalizedContactPhone
      ? [eq(companies.normalizedContactPhone, identity.normalizedContactPhone)]
      : []),
  ];
  const matches = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        or(...conditions),
        ...(exceptCompanyId ? [ne(companies.id, exceptCompanyId)] : []),
      ),
    )
    .limit(1);
  if (matches.length) {
    throw new AppError(
      "A company with the same normalized name, website domain or contact phone is already registered.",
      409,
      "duplicate_company_identity",
    );
  }
}
