import { desc } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companyTargets } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function csvCell(value: string | null): string {
  const safe = value ?? "";
  const formulaSafe = /^[\t\r ]*[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export async function GET(): Promise<Response> {
  await requireApiAdmin();
  const targets = await db.select().from(companyTargets).orderBy(desc(companyTargets.createdAt)).limit(10_000);
  const header = [
    "Company Name", "Website", "Domain", "City", "State", "Industry", "Source",
    "Status", "Contact Form URL", "Pages Crawled", "Crawl Error",
  ];
  const rows = targets.map((target) => [
    target.companyName,
    target.websiteUrl,
    target.domain,
    target.city,
    target.state,
    target.industry,
    target.source,
    target.status,
    target.contactFormUrl ?? "",
    target.pagesCrawled?.toString() ?? "0",
    target.crawlError ?? "",
  ].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ravelyth-company-targets.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
