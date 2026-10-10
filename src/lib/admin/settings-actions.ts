"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { auditLogs, siteSettings } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import { runAdminFormAction } from "@/lib/admin/form-errors";

const optionalUrl = z.string().url().max(500).nullable();
const optionalEmail = z.string().email().max(254).nullable();
const settingsSchema = z.object({
  brandName: z.string().trim().min(1).max(100),
  tagline: z.string().trim().max(200).nullable(),
  subTagline: z.string().trim().max(200).nullable(),
  legalCompanyName: z.string().trim().max(200).nullable(),
  contactEmail: optionalEmail,
  supportEmail: optionalEmail,
  contactPhone: z.string().trim().max(50).nullable(),
  addressLine1: z.string().trim().max(200).nullable(),
  addressLine2: z.string().trim().max(200).nullable(),
  city: z.string().trim().max(120).nullable(),
  state: z.string().trim().max(120).nullable(),
  postalCode: z.string().trim().max(30).nullable(),
  country: z.string().trim().max(100).nullable(),
  jurisdictionCity: z.string().trim().max(120).nullable(),
  gstin: z.string().trim().max(30).nullable(),
  gstRate: z.coerce.number().min(0).max(100),
  socialLinkedin: optionalUrl,
  socialTwitter: optionalUrl,
  socialFacebook: optionalUrl,
  socialInstagram: optionalUrl,
  socialYoutube: optionalUrl,
  privacyPolicyOverride: z.string().max(30000).nullable(),
  termsOverride: z.string().max(30000).nullable(),
  refundPolicyOverride: z.string().max(30000).nullable(),
  featureBlog: z.boolean(),
  featureReviews: z.boolean(),
  featureSalaryInsights: z.boolean(),
  featureResumeDatabase: z.boolean(),
  resumeDbViewLimit: z.coerce.number().int().min(1).max(100000),
  jobPostWarningThreshold: z.coerce.number().int().min(1).max(100),
  freeJobPosts: z.coerce.number().int().min(0).max(100),
  freeInternshipPosts: z.coerce.number().int().min(0).max(1000),
  internshipPostPricePaise: z.coerce.number().int().min(0).max(100_000_000),
  autoApproveCompanies: z.boolean(),
  autoPublishJobs: z.boolean(),
  maintenanceMode: z.boolean(),
});

async function saveSiteSettingsActionImpl(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const admin = await requireApiAdmin();
  const nullable = (name: string) => String(formData.get(name) ?? "").trim() || null;
  const parsed = settingsSchema.safeParse({
    brandName: formData.get("brandName"),
    tagline: nullable("tagline"),
    subTagline: nullable("subTagline"),
    legalCompanyName: nullable("legalCompanyName"),
    contactEmail: nullable("contactEmail"),
    supportEmail: nullable("supportEmail"),
    contactPhone: nullable("contactPhone"),
    addressLine1: nullable("addressLine1"),
    addressLine2: nullable("addressLine2"),
    city: nullable("city"),
    state: nullable("state"),
    postalCode: nullable("postalCode"),
    country: nullable("country"),
    jurisdictionCity: nullable("jurisdictionCity"),
    gstin: nullable("gstin"),
    gstRate: formData.get("gstRate"),
    socialLinkedin: nullable("socialLinkedin"),
    socialTwitter: nullable("socialTwitter"),
    socialFacebook: nullable("socialFacebook"),
    socialInstagram: nullable("socialInstagram"),
    socialYoutube: nullable("socialYoutube"),
    privacyPolicyOverride: nullable("privacyPolicyOverride"),
    termsOverride: nullable("termsOverride"),
    refundPolicyOverride: nullable("refundPolicyOverride"),
    featureBlog: formData.get("featureBlog") === "on",
    featureReviews: formData.get("featureReviews") === "on",
    featureSalaryInsights: formData.get("featureSalaryInsights") === "on",
    featureResumeDatabase: formData.get("featureResumeDatabase") === "on",
    resumeDbViewLimit: formData.get("resumeDbViewLimit"),
    jobPostWarningThreshold: formData.get("jobPostWarningThreshold"),
    freeJobPosts: formData.get("freeJobPosts"),
    freeInternshipPosts: formData.get("freeInternshipPosts"),
    internshipPostPricePaise: formData.get("internshipPostPricePaise"),
    autoApproveCompanies: formData.get("autoApproveCompanies") === "on",
    autoPublishJobs: formData.get("autoPublishJobs") === "on",
    maintenanceMode: formData.get("maintenanceMode") === "on",
  });
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Invalid site settings.", 422);
  }

  const value = parsed.data;
  const updatedAt = new Date();
  await db
    .insert(siteSettings)
    .values({
      id: 1,
      ...value,
      gstRate: value.gstRate.toFixed(2),
      currency: "INR",
      updatedByUserId: admin.id,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: {
        ...value,
        gstRate: value.gstRate.toFixed(2),
        updatedByUserId: admin.id,
        updatedAt,
      },
    });
  await db.insert(auditLogs).values({
    actorUserId: admin.id,
    actorRole: "admin",
    action: "site_settings.updated",
    entityType: "site_settings",
    entityId: "1",
    description: "Site settings updated.",
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function saveSiteSettingsAction(formData: FormData): Promise<void> {
  return runAdminFormAction("/admin/settings", () => saveSiteSettingsActionImpl(formData));
}
