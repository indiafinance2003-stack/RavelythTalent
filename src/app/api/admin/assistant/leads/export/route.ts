import { desc } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companyLeads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function csvCell(value: string | null): string {
  const safe = value ?? "";
  const formulaSafe = /^[\t\r ]*[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export async function GET(): Promise<Response> {
  await requireApiAdmin();
  const leads = await db.select().from(companyLeads).orderBy(desc(companyLeads.createdAt)).limit(10_000);
  const header = [
    "Company Name", "Contact Person", "Contact Designation", "Contact Email",
    "Contact Phone", "Website", "City", "State", "Industry", "Source",
    "Status", "Do Not Contact", "Notes",
  ];
  const rows = leads.map((lead) => [
    lead.company,
    lead.contactName,
    lead.designation,
    lead.email,
    lead.phone,
    lead.website,
    lead.city,
    lead.state,
    lead.industry,
    lead.source,
    lead.status,
    lead.doNotContact ? "true" : "false",
    lead.notes,
  ].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ravelyth-company-leads.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
