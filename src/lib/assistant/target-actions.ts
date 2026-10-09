"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { runAdminFormAction } from "@/lib/admin/form-errors";
import { db } from "@/lib/db";
import {
  assistantSettings,
  auditLogs,
  companyLeads,
  companyTargets,
  contactFormQueue,
  leadEvents,
  targetEmails,
} from "@/lib/db/schema";
import { AppError, NotFoundError } from "@/lib/errors";
import { enforceRateLimit, rateKey } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/security";
import { crawlTargets, domainHasMx } from "./crawl";
import { classifyEmailKind } from "./crawler/extract";
import {
  normalizeTargetDomain,
  parseTargetCsv,
  renderContactFormMessage,
  targetInputSchema,
} from "./targets-csv";

const mutationLimit = { limit: 30, windowSeconds: 60 };

async function requireTargetAdmin() {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  await enforceRateLimit(rateKey("assistantTargetMutation", admin.id), mutationLimit);
  return admin;
}

function targetFromForm(formData: FormData) {
  return {
    companyName: String(formData.get("companyName") ?? ""),
    website: String(formData.get("website") ?? ""),
    city: String(formData.get("city") ?? "") || null,
    state: String(formData.get("state") ?? "") || null,
    industry: String(formData.get("industry") ?? "") || null,
    source: String(formData.get("source") ?? "") || null,
  };
}

/** Inserts one target unless its normalized domain already exists. */
export async function insertTarget(
  input: z.infer<typeof targetInputSchema>,
  adminId: string,
): Promise<"created" | "exists" | "invalid"> {
  const domain = normalizeTargetDomain(input.website);
  if (!domain) return "invalid";
  const [existing] = await db.select({ id: companyTargets.id })
    .from(companyTargets)
    .where(eq(companyTargets.domain, domain))
    .limit(1);
  if (existing) return "exists";
  await db.insert(companyTargets).values({
    companyName: input.companyName,
    websiteUrl: input.website,
    domain,
    city: input.city,
    state: input.state,
    industry: input.industry,
    source: input.source ?? "manual",
    createdById: adminId,
  });
  return "created";
}

async function saveTargetImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const parsed = targetInputSchema.safeParse(targetFromForm(formData));
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid target.", 422);
  const result = await insertTarget(parsed.data, admin.id);
  if (result === "invalid") throw new AppError("Website must be a valid http(s) address.", 422);
  if (result === "exists") throw new AppError("A target for this domain already exists.", 409);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.target_created",
    entityType: "company_target",
    description: "Crawl target added.",
  });
  revalidatePath("/admin/assistant/targets");
}

export async function saveTargetAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => saveTargetImpl(formData));
}

async function importTargetsImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const csv = z.string().min(1).max(2_000_000).safeParse(String(formData.get("csv") ?? ""));
  if (!csv.success) throw new AppError("Select a valid CSV file no larger than 2 MB.", 422);
  let rows;
  try {
    rows = parseTargetCsv(csv.data);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Unable to parse CSV.", 422);
  }
  const validRows = rows.filter((row) => row.data !== null);
  if (!validRows.length) throw new AppError("The CSV has no valid target rows to import.", 422);

  let created = 0;
  let skipped = 0;
  for (const row of validRows) {
    if (!row.data) continue;
    const result = await insertTarget(
      {
        companyName: row.data.companyName,
        website: row.data.website,
        city: row.data.city,
        state: row.data.state,
        industry: row.data.industry,
        source: row.data.source,
      },
      admin.id,
    );
    if (result === "created") created += 1;
    else skipped += 1;
  }
  if (!created) throw new AppError("Every valid domain in this CSV already exists.", 409);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.targets_imported",
    entityType: "company_target",
    description: `CSV import created ${created} target(s); ${skipped} existing domain(s) skipped.`,
    metadata: { created, skippedExisting: skipped, invalidRows: rows.length - validRows.length },
  });
  revalidatePath("/admin/assistant/targets");
}

export async function importTargetsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => importTargetsImpl(formData));
}

async function deleteTargetImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) throw new AppError("Invalid target ID.", 422);
  const [target] = await db.select({ id: companyTargets.id })
    .from(companyTargets).where(eq(companyTargets.id, id.data)).limit(1);
  if (!target) throw new NotFoundError("Target not found.");
  await db.delete(companyTargets).where(eq(companyTargets.id, target.id));
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.target_deleted",
    entityType: "company_target",
    entityId: target.id,
    description: "Crawl target deleted at an administrator's request.",
  });
  revalidatePath("/admin/assistant/targets");
}

export async function deleteTargetAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => deleteTargetImpl(formData));
}

/** Manual "Crawl selected now": always runs, ignoring the crawlEnabled setting. */
async function crawlSelectedImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const ids = formData.getAll("targetIds")
    .map((value) => z.uuid().safeParse(value))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
  if (!ids.length) throw new AppError("Select at least one target to crawl.", 422);
  const chosen = ids.slice(0, 50);
  await crawlTargets(chosen);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.targets_crawled",
    entityType: "company_target",
    description: `${chosen.length} target(s) crawled on request.`,
    metadata: { count: chosen.length },
  });
  revalidatePath("/admin/assistant/targets");
}

export async function crawlSelectedTargetsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => crawlSelectedImpl(formData));
}

/**
 * Approves the selected crawled emails of one target as CRM leads. Existing
 * lead emails are skipped, and the target is marked "converted".
 */
async function approveTargetEmailsImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const targetId = z.uuid().safeParse(formData.get("targetId"));
  if (!targetId.success) throw new AppError("Invalid target ID.", 422);
  const emailIds = formData.getAll("emailIds")
    .map((value) => z.uuid().safeParse(value))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data);
  if (!emailIds.length) throw new AppError("Select at least one email to approve.", 422);

  const [target] = await db.select().from(companyTargets)
    .where(eq(companyTargets.id, targetId.data)).limit(1);
  if (!target) throw new NotFoundError("Target not found.");

  const emails = await db.select().from(targetEmails)
    .where(and(eq(targetEmails.targetId, target.id), inArray(targetEmails.id, emailIds)));
  if (!emails.length) throw new AppError("None of the selected emails exist any more.", 409);

  let created = 0;
  await db.transaction(async (tx) => {
    for (const item of emails) {
      const [lead] = await tx.insert(companyLeads)
        .values({
          company: target.companyName,
          email: item.email,
          website: target.websiteUrl,
          city: target.city,
          state: target.state,
          industry: target.industry,
          source: "website",
          createdByUserId: admin.id,
        })
        .onConflictDoNothing()
        .returning({ id: companyLeads.id });
      if (!lead) continue;
      created += 1;
      await tx.insert(leadEvents).values({
        leadId: lead.id,
        actorUserId: admin.id,
        eventType: "target_approved",
        toStatus: "new",
        details: `Approved from target ${target.domain}.`,
      });
    }
    await tx.update(companyTargets)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(companyTargets.id, target.id));
  });
  if (!created) throw new AppError("These emails already exist as leads.", 409);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.target_emails_approved",
    entityType: "company_target",
    entityId: target.id,
    description: `${created} lead(s) created from crawled emails.`,
    metadata: { targetId: target.id, created },
  });
  revalidatePath("/admin/assistant/targets");
  revalidatePath("/admin/assistant/leads");
}

export async function approveTargetEmailsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => approveTargetEmailsImpl(formData));
}

/** Rejects a target so it is not crawled again and never becomes a lead. */
async function rejectTargetImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const id = z.uuid().safeParse(formData.get("targetId"));
  if (!id.success) throw new AppError("Invalid target ID.", 422);
  const [updated] = await db.update(companyTargets)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(eq(companyTargets.id, id.data))
    .returning({ id: companyTargets.id });
  if (!updated) throw new NotFoundError("Target not found.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.target_rejected",
    entityType: "company_target",
    entityId: updated.id,
    description: "Crawl target rejected.",
  });
  revalidatePath("/admin/assistant/targets");
}

export async function rejectTargetAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => rejectTargetImpl(formData));
}

/** Adds one email an admin typed in by hand, doing the same MX marking. */
async function addManualTargetEmailImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const parsed = z.object({
    targetId: z.uuid(),
    email: z.email().transform((value) => value.trim().toLocaleLowerCase("en")),
  }).safeParse({
    targetId: formData.get("targetId"),
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.success) throw new AppError("Enter a valid email address.", 422);

  const [target] = await db.select({ id: companyTargets.id })
    .from(companyTargets).where(eq(companyTargets.id, parsed.data.targetId)).limit(1);
  if (!target) throw new NotFoundError("Target not found.");

  const domain = parsed.data.email.split("@")[1] ?? "";
  const mxOk = domain ? await domainHasMx(domain) : false;
  const [inserted] = await db.insert(targetEmails).values({
    targetId: target.id,
    email: parsed.data.email,
    kind: classifyEmailKind(parsed.data.email),
    sourceUrl: null,
    mxOk,
  }).onConflictDoNothing().returning({ id: targetEmails.id });
  if (!inserted) throw new AppError("That email is already recorded for this target.", 409);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.target_email_added",
    entityType: "company_target",
    entityId: target.id,
    description: "A contact email was added by hand.",
  });
  revalidatePath("/admin/assistant/targets");
}

export async function addManualTargetEmailAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => addManualTargetEmailImpl(formData));
}

/**
 * Inserts a contact-form queue row using the current template and marks the
 * target converted. The caller must already have confirmed the form URL and
 * that no pending/done queue row exists for the target.
 */
async function enqueueContactForm(
  target: typeof companyTargets.$inferSelect,
): Promise<void> {
  const [settings] = await db.select({ template: assistantSettings.contactFormTemplate })
    .from(assistantSettings)
    .where(eq(assistantSettings.id, 1))
    .limit(1);
  const preparedMessage = renderContactFormMessage(
    settings?.template ?? "",
    target.companyName,
  );

  await db.transaction(async (tx) => {
    await tx.insert(contactFormQueue).values({
      targetId: target.id,
      companyName: target.companyName,
      formUrl: target.contactFormUrl!,
      preparedMessage,
    });
    await tx.update(companyTargets)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(companyTargets.id, target.id));
  });
}

/**
 * Sends a contact-form-only target to the manual contact-form queue with the
 * prepared template message. Nothing is ever submitted automatically.
 */
async function queueContactFormImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const id = z.uuid().safeParse(formData.get("targetId"));
  if (!id.success) throw new AppError("Invalid target ID.", 422);

  const [target] = await db.select().from(companyTargets)
    .where(eq(companyTargets.id, id.data)).limit(1);
  if (!target) throw new NotFoundError("Target not found.");
  if (!target.contactFormUrl) {
    throw new AppError("This target has no contact form URL to queue.", 422);
  }

  const [existing] = await db.select({ id: contactFormQueue.id })
    .from(contactFormQueue)
    .where(and(
      eq(contactFormQueue.targetId, target.id),
      inArray(contactFormQueue.status, ["pending", "done"]),
    ))
    .limit(1);
  if (existing) throw new AppError("This target is already in the contact-form queue.", 409);

  await enqueueContactForm(target);
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "assistant.contact_form_queued",
    entityType: "company_target",
    entityId: target.id,
    description: "Contact form added to the manual outreach queue.",
  });
  revalidatePath("/admin/assistant/targets");
  revalidatePath("/admin/assistant/contact-forms");
}

export async function queueContactFormAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/targets", () => queueContactFormImpl(formData));
}

/** Marks a queued contact form as done or skipped; never submits the form. */
async function updateContactFormItemImpl(formData: FormData): Promise<void> {
  const admin = await requireTargetAdmin();
  const parsed = z.object({
    id: z.uuid(),
    status: z.enum(["pending", "done", "skipped"]),
    notes: z.string().trim().max(5_000).nullable(),
  }).safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (!parsed.success) throw new AppError("Invalid contact-form queue update.", 422);

  const [updated] = await db.update(contactFormQueue)
    .set({
      status: parsed.data.status,
      doneAt: parsed.data.status === "pending" ? null : new Date(),
      notes: parsed.data.notes,
    })
    .where(eq(contactFormQueue.id, parsed.data.id))
    .returning({ id: contactFormQueue.id });
  if (!updated) throw new NotFoundError("Contact-form queue item not found.");
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: `assistant.contact_form_${parsed.data.status}`,
    entityType: "contact_form_queue",
    entityId: updated.id,
    description: `Contact-form queue item marked ${parsed.data.status}.`,
  });
  revalidatePath("/admin/assistant/contact-forms");
}

export async function updateContactFormItemAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/assistant/contact-forms", () => updateContactFormItemImpl(formData));
}

