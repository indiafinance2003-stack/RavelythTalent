"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, companies, companyReviews } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";

const schema = z.object({
  reviewId: z.uuid(),
  status: z.enum(["published", "rejected"]),
  notes: z.string().trim().max(1000),
});

async function moderateCompanyReviewActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const parsed = schema.safeParse({
    reviewId: formData.get("reviewId"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid review decision.", 422);

  const companySlug = await db.transaction(async (tx) => {
    const [review] = await tx
      .update(companyReviews)
      .set({
        status: parsed.data.status,
        moderationNotes: parsed.data.notes || null,
        moderatedByUserId: admin.id,
        moderatedAt: new Date(),
      })
      .where(eq(companyReviews.id, parsed.data.reviewId))
      .returning({ id: companyReviews.id, companyId: companyReviews.companyId });
    if (!review) throw new AppError("Review not found.", 404, "not_found");

    const [aggregate] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        average: sql<string>`coalesce(round(avg(${companyReviews.rating})::numeric, 2), 0)::text`,
      })
      .from(companyReviews)
      .where(and(eq(companyReviews.companyId, review.companyId), eq(companyReviews.status, "published")));
    await tx
      .update(companies)
      .set({
        reviewsCount: aggregate?.count ?? 0,
        averageRating: aggregate?.average ?? "0",
        updatedAt: new Date(),
      })
      .where(eq(companies.id, review.companyId));
    await tx.insert(auditLogs).values({
      actorUserId: admin.id,
      actorRole: "admin",
      action: `company_review.${parsed.data.status}`,
      entityType: "company_review",
      entityId: review.id,
      description: `Company review ${parsed.data.status}.`,
      metadata: { notes: parsed.data.notes || null },
    });
    const [company] = await tx
      .select({ slug: companies.slug })
      .from(companies)
      .where(eq(companies.id, review.companyId))
      .limit(1);
    return company?.slug;
  });
  revalidatePath("/admin/reviews");
  if (companySlug) revalidatePath(`/companies/${companySlug}`);
  revalidatePath("/companies");
}

export async function moderateCompanyReviewAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/reviews", () => moderateCompanyReviewActionImpl(formData));
}
