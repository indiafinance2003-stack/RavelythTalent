import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";

export type SiteSettings = typeof siteSettings.$inferSelect;

/**
 * Shown until an administrator fills the real values in /admin/settings.
 * We never invent a legal name, address, phone number, GSTIN or social link.
 */
export const FALLBACK_SETTINGS: SiteSettings = {
  id: 1,
  brandName: "Ravelyth Talent",
  tagline: "Connecting Great People with Great Opportunities",
  subTagline: "Right People | Better Opportunities | Stronger Tomorrow",
  legalCompanyName: null,
  contactEmail: null,
  supportEmail: null,
  contactPhone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: "India",
  jurisdictionCity: null,
  gstin: null,
  gstRate: "0",
  currency: "INR",
  socialLinkedin: null,
  socialTwitter: null,
  socialFacebook: null,
  socialInstagram: null,
  socialYoutube: null,
  privacyPolicyOverride: null,
  termsOverride: null,
  refundPolicyOverride: null,
  featureBlog: true,
  featureReviews: true,
  featureSalaryInsights: true,
  featureResumeDatabase: true,
  resumeDbViewLimit: 50,
  jobPostWarningThreshold: 80,
  freeJobPosts: 3,
  freeInternshipPosts: 5,
  internshipPostPricePaise: 39900,
  autoApproveCompanies: true,
  autoPublishJobs: true,
  maintenanceMode: false,
  updatedByUserId: null,
  updatedAt: new Date(0),
};

/** Cache the settings lookup for the duration of a single request. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const rows = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.id, 1))
      .limit(1);
    const row = rows.at(0);
    if (!row) return FALLBACK_SETTINGS;
    return { ...FALLBACK_SETTINGS, ...row };
  } catch (error) {
    console.error("[settings] falling back to defaults:", error);
    return FALLBACK_SETTINGS;
  }
});

/** Legal name, or a clearly-marked placeholder that admins are prompted to fill. */
export function displayLegalName(settings: SiteSettings): string {
  return settings.legalCompanyName?.trim() || settings.brandName;
}

export function hasContactDetails(settings: SiteSettings): boolean {
  return Boolean(
    settings.contactEmail || settings.contactPhone || settings.addressLine1,
  );
}

export function socialLinks(settings: SiteSettings) {
  return [
    { key: "linkedin", label: "LinkedIn", url: settings.socialLinkedin },
    { key: "twitter", label: "X (Twitter)", url: settings.socialTwitter },
    { key: "facebook", label: "Facebook", url: settings.socialFacebook },
    { key: "instagram", label: "Instagram", url: settings.socialInstagram },
    { key: "youtube", label: "YouTube", url: settings.socialYoutube },
  ].filter((s): s is { key: string; label: string; url: string } =>
    Boolean(s.url && s.url.trim()),
  );
}
