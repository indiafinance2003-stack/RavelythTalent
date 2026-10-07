import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { handleApi, jsonOk } from "@/lib/http";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companyLeads } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { parseLeadCsv } from "@/lib/assistant/leads-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantLeadPreview", admin.id), { limit: 10, windowSeconds: 60 });
  const body = z.object({ csv: z.string().min(1).max(2_000_000) }).safeParse(await request.json());
  if (!body.success) throw new AppError("CSV is missing or larger than 2 MB.", 422);

  let rows;
  try {
    rows = parseLeadCsv(body.data.csv);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Unable to parse CSV.", 422);
  }
  const emails = [...new Set(rows.flatMap((row) => row.data ? [row.data.email] : []))];
  const existing = emails.length
    ? await db.select({ email: companyLeads.email }).from(companyLeads)
      .where(inArray(sql<string>`lower(${companyLeads.email})`, emails))
    : [];
  const existingEmails = new Set(existing.map((item) => item.email.toLocaleLowerCase("en")));
  const preview = rows.map((row) => {
    if (!row.data || !existingEmails.has(row.data.email)) return row;
    return { row: row.row, data: null, error: "This email already exists in the CRM." };
  });
  return jsonOk({
    rows: preview,
    valid: preview.filter((row) => row.data !== null).length,
    invalid: preview.filter((row) => row.error !== null).length,
  });
});
