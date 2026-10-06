import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  builtResumeVersions,
  builtResumes,
  companies,
  companyMembers,
  companyVerificationDocuments,
  invoices,
  payments,
  resumes,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { deleteStoredFiles } from "@/lib/storage";
import {
  shouldDeleteOwnedCompany,
  userDeletionBlockReason,
} from "./user-deletion-policy";

export async function deleteAdminManagedUser(input: {
  actorUserId: string;
  targetUserId: string;
  confirmationEmail: string;
}): Promise<{ failedFileCleanupCount: number }> {
  const filesToDelete = await db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, input.targetUserId))
      .limit(1)
      .for("update");
    if (!target) throw new AppError("User not found.", 404, "not_found");
    if (input.confirmationEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      throw new AppError("Type the account email address exactly to confirm deletion.", 422, "email_confirmation_mismatch");
    }

    const ownedCompanies = await tx
      .select({ id: companies.id, logoPath: companies.logoPath })
      .from(companies)
      .where(eq(companies.ownerUserId, target.id))
      .orderBy(asc(companies.createdAt))
      .for("update");
    const ownedCompanyIds = ownedCompanies.map((company) => company.id);
    const companyCondition = ownedCompanyIds.length > 0
      ? or(eq(payments.userId, target.id), inArray(payments.companyId, ownedCompanyIds))!
      : eq(payments.userId, target.id);
    const [paidPayment] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          companyCondition,
          inArray(payments.status, ["captured", "refunded"]),
        ),
      )
      .limit(1);
    const invoiceCondition = ownedCompanyIds.length > 0
      ? or(eq(invoices.userId, target.id), inArray(invoices.companyId, ownedCompanyIds))!
      : eq(invoices.userId, target.id);
    const [invoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(invoiceCondition)
      .limit(1);

    const blockReason = userDeletionBlockReason({
      actorUserId: input.actorUserId,
      targetUserId: target.id,
      targetRole: target.role,
      hasPaidPayment: Boolean(paidPayment),
      hasInvoice: Boolean(invoice),
    });
    if (blockReason) {
      throw new AppError(blockReason, 409, "user_deletion_blocked");
    }

    const userResumeRows = await tx
      .select({ storagePath: resumes.storagePath })
      .from(resumes)
      .where(eq(resumes.userId, target.id));
    const builtResumeFileRows = await tx
      .select({ storagePath: builtResumeVersions.pdfPath })
      .from(builtResumeVersions)
      .innerJoin(builtResumes, eq(builtResumes.id, builtResumeVersions.builtResumeId))
      .where(eq(builtResumes.userId, target.id));
    const files = [
      ...userResumeRows.map((row) => row.storagePath),
      ...builtResumeFileRows.flatMap((row) => row.storagePath ? [row.storagePath] : []),
      ...ownedCompanies.flatMap((company) => company.logoPath ? [company.logoPath] : []),
    ];

    const companiesToDelete: string[] = [];
    for (const company of ownedCompanies) {
      const otherMembers = await tx
        .select({
          id: companyMembers.id,
          userId: companyMembers.userId,
        })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, company.id),
            eq(companyMembers.status, "active"),
            ne(companyMembers.userId, target.id),
            isNotNull(companyMembers.userId),
          ),
        )
        .orderBy(asc(companyMembers.createdAt))
        .for("update");
      if (shouldDeleteOwnedCompany(otherMembers.length)) {
        companiesToDelete.push(company.id);
        continue;
      }

      const successor = otherMembers[0]!;
      await tx
        .update(companies)
        .set({ ownerUserId: successor.userId!, updatedAt: new Date() })
        .where(eq(companies.id, company.id));
      await tx
        .update(companyMembers)
        .set({ role: "owner", updatedAt: new Date() })
        .where(eq(companyMembers.id, successor.id));
    }

    if (companiesToDelete.length > 0) {
      const verificationFiles = await tx
        .select({ storagePath: companyVerificationDocuments.storagePath })
        .from(companyVerificationDocuments)
        .where(inArray(companyVerificationDocuments.companyId, companiesToDelete));
      files.push(...verificationFiles.map((row) => row.storagePath));
      await tx.delete(companies).where(inArray(companies.id, companiesToDelete));
    }

    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      actorRole: "admin",
      action: "user.deleted",
      entityType: "user",
      entityId: target.id,
      description: "User account and associated data were deleted by an administrator.",
    });

    await tx.delete(users).where(eq(users.id, target.id));

    return files;
  });

  const failedFileCleanupCount = await deleteStoredFiles(filesToDelete);
  return { failedFileCleanupCount };
}
