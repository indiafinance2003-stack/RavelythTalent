import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { handleApi, jsonOk } from "@/lib/http";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companyTargets } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { parseTargetCsv } from "@/lib/assistant/targets-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleApi(async (request: Request) => {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantTargetPreview", admin.id), { limit: 10, windowSeconds: 60 });
  const body = z.object({ csv: z.string().min(1).max(2_000_000) }).safeParse(await request.json());
  if (!body.success) throw new AppError("CSV is missing or larger than 2 MB.", 422);

  let rows;
  try {
    rows = parseTargetCsv(body.data.csv);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Unable to parse CSV.", 422);
  }
  const domains = [...new Set(rows.flatMap((row) => row.data ? [row.data.domain] : []))];
  const existing = domains.length
    ? await db.select({ domain: companyTargets.domain }).from(companyTargets)
      .where(inArray(sql<string>`lower(${companyTargets.domain})`, domains.map((d) => d.toLocaleLowerCase("en"))))
    : [];
  const existingDomains = new Set(existing.map((item) => item.domain.toLocaleLowerCase("en")));
  const preview = rows.map((row) => {
    if (!row.data || !existingDomains.has(row.data.domain)) return row;
    return { row: row.row, data: null, error: "A target for this domain already exists." };
  });
  return jsonOk({
    rows: preview,
    valid: preview.filter((row) => row.data !== null).length,
    invalid: preview.filter((row) => row.error !== null).length,
  });
});
