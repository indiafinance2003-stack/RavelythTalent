"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import {
  auditLogs,
  companyLeads,
  leadEvents,
  suppressedEmails,
} from "@/lib/db/schema";
import { AppError, ConflictError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { leadInputSchema, leadStatuses, parseLeadCsv } from "./leads-csv";

const mutationLimit = { limit: 30, windowSeconds: 60 };

async function requireAssistantAdmin() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantLeadMutation", admin.id), mutationLimit);
  return admin;
}

function inputFromForm(formData: FormData) {
  return {
    company: String(formData.get("company") ?? ""),
    contactName: String(formData.get("contactName") ?? "") || null,
    designation: String(formData.get("designation") ?? "") || null,
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? "") || null,
    website: String(formData.get("website") ?? "") || null,
    city: String(formData.get("city") ?? "") || null,
    state: String(formData.get("state") ?? "") || null,
    industry: String(formData.get("industry") ?? "") || null,
    source: String(formData.get("source") ?? "") || null,
  };
}

function followupDateFromForm(formData: FormData): Date | null {
  const value = String(formData.get("nextFollowupDate") ?? "").trim();
  if (!value) return null;
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) throw new AppError("Choose a valid follow-up date.", 422);
  return new Date(`${parsed.data}T00:00:00.000Z`);
}

async function saveLeadImpl(formData: FormData): Promise<void> {
  const admin = await requireAssistantAdmin();
  const id = z.uuid().optional().safeParse(String(formData.get("id") ?? "") || undefined);
  if (!id.success) throw new AppError("Invalid lead ID.", 422);
  const lead = leadInputSchema.safeParse(inputFromForm(formData));
  if (!lead.success) throw new AppError(lead.error.issues[0]?.message ?? "Invalid lead.", 422);
  const notes = z.string().trim().max(5000).nullable()
    .safeParse(String(formData.get("notes") ?? "").trim() || null);
  if (!notes.success) throw new AppError("Notes must be no longer than 5,000 characters.", 422);
  const nextFollowupAt = followupDateFromForm(formData);

  await db.transaction(async (tx) => {
    if (id.data) {
      const [existing] = await tx.select().from(companyLeads)
        .where(eq(companyLeads.id, id.data))
        .limit(1);
      if (!existing) throw new NotFoundError("Lead not found.");
      const [duplicate] = await tx.select({ id: companyLeads.id })
        .from(companyLeads)
        .where(and(
          sql`lower(${companyLeads.email}) = ${lead.data.email}`,
          ne(companyLeads.id, existing.id),
        ))
        .limit(1);
      if (duplicate) throw new ConflictError("A lead with this email already exists.");
      const [updated] = await tx.update(companyLeads)
        .set({
          ...lead.data,
          notes: notes.data,
          nextFollowupAt,
          doNotContact: existing.doNotContact,
          status: existing.doNotContact ? "do_not_contact" : existing.status,
          updatedAt: new Date(),
        })
        .where(eq(companyLeads.id, id.data))
        .returning({ id: companyLeads.id });
      if (!updated) throw new NotFoundError("Lead not found.");
      await tx.insert(leadEvents).values({
        leadId: updated.id,
        actorUserId: admin.id,
        eventType: "updated",
        fromStatus: existing.status,
        toStatus: existing.doNotContact ? "do_not_contact" : existing.status,
        details: "Lead details updated by an administrator.",
      });
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorRole: "admin",
        action: "assistant.lead_updated",
        entityType: "company_lead",
        entityId: updated.id,
        description: "Company lead details updated.",
      });
    } else {
      const [created] = await tx.insert(companyLeads)
        .values({
          ...lead.data,
          notes: notes.data,
          nextFollowupAt,
          createdByUserId: admin.id,
        })
        .onConflictDoNothing()
        .returning({ id: companyLeads.id });
      if (!created) throw new ConflictError("A lead with this email already exists.");
      await tx.insert(leadEvents).values({
        leadId: created.id,
        actorUserId: admin.id,
        eventType: "created",
        toStatus: "new",
        details: "Lead added manually by an administrator.",
      });
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        actorRole: "admin",
        action: "assistant.lead_created",
        entityType: "company_lead",
        entityId: created.id,
        description: "Company lead added manually.",
      });
    }
  });
  revalidatePath("/admin/assistant/leads");
  revalidatePath("/admin/assistant");
}

export async function saveLeadAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/leads", () => saveLeadImpl(formData));
}

async function changeLeadStatusImpl(formData: FormData): Promise<void> {
  const admin = await requireAssistantAdmin();
  const parsed = z.object({
    ids: z.array(z.uuid()).min(1).max(100),
    status: z.enum(leadStatuses),
  }).safeParse({
    ids: formData.getAll("leadIds"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new AppError("Select leads and a valid status.", 422);
  const ids = [...new Set(parsed.data.ids)];

  await db.transaction(async (tx) => {
    const selected = await tx.select().from(companyLeads)
      .where(inArray(companyLeads.id, ids));
    if (selected.length !== ids.length) throw new NotFoundError("One or more selected leads no longer exist.");

    for (const lead of selected) {
      const status = lead.doNotContact ? "do_not_contact" : parsed.data.status;
      const optedOut = status === "do_not_contact";
      await tx.update(companyLeads).set({
        status,
        doNotContact: optedOut || lead.doNotContact,
        updatedAt: new Date(),
      }).where(eq(companyLeads.id, lead.id));
      if (optedOut) {
        await tx.insert(suppressedEmails).values({
          email: lead.email.toLocaleLowerCase("en"),
          reason: "Lead marked do not contact by administrator",
          source: "admin",
          leadId: lead.id,
        }).onConflictDoNothing();
      }
      if (lead.status !== status) {
        await tx.insert(leadEvents).values({
          leadId: lead.id,
          actorUserId: admin.id,
          eventType: "status_changed",
          fromStatus: lead.status,
          toStatus: status,
          details: "Lead status changed by an administrator.",
        });
      }
    }
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "assistant.leads_status_changed",
      entityType: "company_lead",
      description: `Bulk status change applied to ${selected.length} lead(s).`,
      metadata: { count: selected.length, status: parsed.data.status },
    });
  });
  revalidatePath("/admin/assistant/leads");
  revalidatePath("/admin/assistant");
}

export async function changeLeadStatusAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/leads", () => changeLeadStatusImpl(formData));
}

async function importLeadsImpl(formData: FormData): Promise<void> {
  const admin = await requireAssistantAdmin();
  const csv = z.string().min(1).max(2_000_000)
    .safeParse(String(formData.get("csv") ?? ""));
  if (!csv.success) throw new AppError("Select a valid CSV file no larger than 2 MB.", 422);
  let rows;
  try {
    rows = parseLeadCsv(csv.data);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Unable to parse CSV.", 422);
  }
  const validRows = rows.filter((row) => row.data !== null);
  if (!validRows.length) throw new AppError("The CSV has no valid lead rows to import.", 422);

  const imported = await db.transaction(async (tx) => {
    let count = 0;
    for (const row of validRows) {
      if (!row.data) continue;
      const [created] = await tx.insert(companyLeads)
        .values({
          ...row.data,
          ...(row.history?.status ? { status: row.history.status } : {}),
          ...(row.history?.lastContactedAt ? { lastContactedAt: row.history.lastContactedAt } : {}),
          createdByUserId: admin.id,
        })
        .onConflictDoNothing()
        .returning({ id: companyLeads.id });
      if (!created) continue;
      count += 1;
      await tx.insert(leadEvents).values({
        leadId: created.id,
        actorUserId: admin.id,
        eventType: "csv_import",
        toStatus: row.history?.status ?? "new",
        details: `Imported from CSV row ${row.row}.`,
      });
    }
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "assistant.leads_imported",
      entityType: "company_lead",
      description: `CSV import created ${count} lead(s); ${validRows.length - count} existing email(s) skipped.`,
      metadata: { imported: count, skippedExisting: validRows.length - count, invalidRows: rows.length - validRows.length },
    });
    return count;
  });
  if (!imported) throw new ConflictError("Every valid email in this CSV already exists.");
  revalidatePath("/admin/assistant/leads");
}

export async function importLeadsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/leads", () => importLeadsImpl(formData));
}

async function deleteLeadImpl(formData: FormData): Promise<void> {
  const admin = await requireAssistantAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) throw new AppError("Invalid lead ID.", 422);

  await db.transaction(async (tx) => {
    const [lead] = await tx.select().from(companyLeads)
      .where(eq(companyLeads.id, id.data))
      .limit(1);
    if (!lead) throw new NotFoundError("Lead not found.");

    await tx.delete(companyLeads).where(eq(companyLeads.id, lead.id));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: "assistant.lead_deleted",
      entityType: "company_lead",
      entityId: lead.id,
      description: "Lead data deleted at an administrator's request.",
    });
  });
  revalidatePath("/admin/assistant/leads");
}

export async function deleteLeadAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/leads", () => deleteLeadImpl(formData));
}
