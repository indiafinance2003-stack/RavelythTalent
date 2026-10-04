"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiVerifiedUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companies, companyReviews } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getSiteSettings } from "@/lib/settings";
import { assertSameOrigin } from "@/lib/security";
import { formError, formSuccess, type FormState } from "@/lib/form-state";

const reviewSchema = z.object({
  companyId: z.uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(140),
  pros: z.string().trim().max(1500),
  cons: z.string().trim().max(1500),
  body: z.string().trim().min(30).max(5000),
});

export async function submitCompanyReviewAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertSameOrigin();
    const user = await requireApiVerifiedUser();
    if (user.role !== "job_seeker") {
      throw new AppError("Only candidate accounts can submit company reviews.", 403, "candidate_only");
    }
    if (!(await getSiteSettings()).featureReviews) {
      throw new AppError("Company reviews are currently unavailable.", 404, "reviews_disabled");
    }

    const parsed = reviewSchema.safeParse({
      companyId: formData.get("companyId"),
      rating: formData.get("rating"),
      title: formData.get("title") ?? "",
      pros: formData.get("pros") ?? "",
      cons: formData.get("cons") ?? "",
      body: formData.get("body"),
    });
    if (!parsed.success) {
      return formError(parsed.error.issues[0]?.message ?? "Check your review and try again.");
    }
    const company = await db
      .select({ id: companies.id, slug: companies.slug })
      .from(companies)
      .where(and(eq(companies.id, parsed.data.companyId), eq(companies.status, "approved"), isNull(companies.deletedAt)))
      .limit(1);
    if (!company[0]) throw new AppError("Company not found.", 404, "not_found");

    const existing = await db
      .select({ id: companyReviews.id })
      .from(companyReviews)
      .where(and(eq(companyReviews.companyId, company[0].id), eq(companyReviews.userId, user.id)))
      .limit(1);
    if (existing[0]) {
      throw new AppError("You have already reviewed this company.", 409, "review_exists");
    }
    await db.insert(companyReviews).values({
      companyId: company[0].id,
      userId: user.id,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      pros: parsed.data.pros || null,
      cons: parsed.data.cons || null,
      body: parsed.data.body,
    });
    revalidatePath(`/companies/${company[0].slug}`);
    return formSuccess("Your review was submitted for moderation.");
  } catch (error) {
    if (error instanceof AppError) return formError(error.message);
    if (isUniqueViolation(error)) {
      return formError("You have already reviewed this company.");
    }
    console.error("[company-reviews] submission failed:", error);
    return formError("We could not submit your review. Please try again.");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
