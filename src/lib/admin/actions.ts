"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { db } from "@/lib/db";
import {
  auditLogs,
  companies,
  companyVerificationDocuments,
  users,
} from "@/lib/db/schema";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  companyRestoredEmail,
  companySuspendedEmail,
} from "@/lib/email/templates/recruiter";
import { decideCompanyReview, decideJobReview } from "./moderation";
import { markJobReportReviewed } from "@/lib/jobs/reports";
import { runAdminFormAction } from "@/lib/admin/form-errors";

const decisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(1000).optional(),
});

async function parseDecision(formData: FormData) {
  const parsed = decisionSchema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid review decision.", 422);
  }
  if (parsed.data.decision === "rejected" && !parsed.data.reason) {
    throw new AppError("Provide a reason when rejecting a submission.", 422);
  }
  return parsed.data;
}

async function decideCompanyActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const decision = await parseDecision(formData);
  await decideCompanyReview(
    admin.id,
    decision.id,
    decision.decision,
    decision.reason ?? null,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/companies");
  revalidatePath("/recruiter/company");
}

export async function decideCompanyAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/companies", () => decideCompanyActionImpl(formData));
}

async function decideJobActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const decision = await parseDecision(formData);
  await decideJobReview(
    admin.id,
    decision.id,
    decision.decision,
    decision.reason ?? null,
  );
  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/recruiter/jobs");
  revalidatePath("/jobs");
}

export async function decideJobAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/jobs", () => decideJobActionImpl(formData));
}

async function markJobReportReviewedActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const reportId = z.uuid().safeParse(formData.get("reportId"));
  if (!reportId.success) {
    throw new AppError("Choose a valid job report.", 422, "invalid_report");
  }
  await markJobReportReviewed(reportId.data, admin.id);
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

export async function markJobReportReviewedAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/reports", () => markJobReportReviewedActionImpl(formData));
}

const companyStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["approved", "suspended"]),
  reason: z.string().trim().max(1000).optional(),
});

async function changeCompanyStatusActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = companyStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    reason: String(formData.get("reason") ?? "").trim() || undefined,
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid company status.", 422);
  if (parsed.data.status === "suspended" && !parsed.data.reason) {
    throw new AppError("Provide a reason when suspending a company.", 422);
  }

  const result = await db.transaction(async (tx) => {
    const [company] = await tx.select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      ownerName: users.fullName,
      ownerEmail: users.email,
    })
      .from(companies)
      .innerJoin(users, eq(users.id, companies.ownerUserId))
      .where(and(
        eq(companies.id, parsed.data.id),
        inArray(companies.status, ["approved", "suspended"]),
      ))
      .limit(1);
    if (!company) throw new AppError("Approved or suspended company not found.", 404, "not_found");
    if (company.status === parsed.data.status) return null;

    const now = new Date();
    await tx.update(companies)
      .set({
        status: parsed.data.status,
        statusReason: parsed.data.status === "suspended" ? parsed.data.reason! : null,
        reviewedByUserId: admin.id,
        reviewedAt: now,
        verifiedAt: parsed.data.status === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(companies.id, company.id));
    await tx.update(companyVerificationDocuments)
      .set({
        status: parsed.data.status === "approved" ? "approved" : "pending",
        notes: parsed.data.status === "suspended" ? parsed.data.reason! : null,
        reviewedByUserId: admin.id,
        reviewedAt: now,
      })
      .where(eq(companyVerificationDocuments.companyId, company.id));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: `company.${parsed.data.status}`,
      entityType: "company",
      entityId: company.id,
      description: `${company.name} was ${parsed.data.status}.`,
      metadata: parsed.data.reason ? { reason: parsed.data.reason } : {},
    });
    return {
      name: company.name,
      ownerName: company.ownerName,
      ownerEmail: company.ownerEmail,
    };
  });

  if (result) {
    try {
      const brand = await getEmailBrand();
      await queueRenderedEmail({
        to: result.ownerEmail,
        toName: result.ownerName,
        templateKey: `company_${parsed.data.status}`,
        rendered: parsed.data.status === "suspended"
          ? companySuspendedEmail({
              ownerName: result.ownerName,
              companyName: result.name,
              reason: parsed.data.reason!,
              brand,
            })
          : companyRestoredEmail({
              ownerName: result.ownerName,
              companyName: result.name,
              brand,
            }),
      });
    } catch (error) {
      console.error("[admin] could not queue company status email:", error);
    }
  }

  revalidatePath("/admin/companies");
  revalidatePath("/recruiter");
  revalidatePath("/jobs");
}

export async function changeCompanyStatusAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/companies", () => changeCompanyStatusActionImpl(formData));
}
