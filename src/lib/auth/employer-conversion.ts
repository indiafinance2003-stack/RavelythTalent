import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  candidateProfiles,
  companies,
  companyMembers,
  companySizeEnum,
  jobs,
  subscriptions,
  users,
} from "@/lib/db/schema";
import { AppError, AuthorizationError, NotFoundError } from "@/lib/errors";
import {
  assertCompanyIdentityAvailable,
  normalizeCompanyName,
  normalizeContactPhone,
  normalizeWebsiteDomain,
} from "@/lib/company-identity";
import { isDisposableEmail } from "@/lib/auth/disposable-email";
import { uniqueCompanySlug } from "@/lib/auth/service";
import { getSiteSettings } from "@/lib/settings";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import {
  companyConversionConfirmationEmail,
  companyVerificationApprovedEmail,
  companyVerificationSubmittedEmail,
} from "@/lib/email/templates/recruiter";

export type CompanySize = (typeof companySizeEnum.enumValues)[number];

export type EmployerConversionInput = {
  name: string;
  website: string | null;
  phone: string | null;
  industry: string | null;
  size: CompanySize | null;
  city: string;
};

export function conversionFreePostsUsed(
  hasConvertedBefore: boolean,
  configuredFreePosts: number,
): number {
  return hasConvertedBefore ? Math.max(0, configuredFreePosts) : 0;
}

export function candidateVisibilityForEmployer(discoverable: boolean): {
  discoverable: false;
  restoreDiscoverable: boolean;
} {
  return { discoverable: false, restoreDiscoverable: discoverable };
}

export function candidateVisibilityForCandidate(
  previouslyDiscoverable: boolean | null,
): boolean {
  return previouslyDiscoverable ?? false;
}

export function retainedCandidatePremiumExpiry(
  subscription: {
    status: string;
    companyId: string | null;
    currentPeriodEnd: Date;
  } | null,
  now = new Date(),
): Date | null {
  return subscription?.status === "active" &&
    subscription.companyId === null &&
    subscription.currentPeriodEnd > now
    ? subscription.currentPeriodEnd
    : null;
}

export function switchBackReason(input: {
  liveJobs: number;
  heldJobs: number;
  hasActiveEmployerSubscription: boolean;
}): string | null {
  const reasons: string[] = [];
  if (input.liveJobs + input.heldJobs > 0) {
    reasons.push(
      `${input.liveJobs + input.heldJobs} live or held job${input.liveJobs + input.heldJobs === 1 ? "" : "s"} (${input.liveJobs} live, ${input.heldJobs} held)`,
    );
  }
  if (input.hasActiveEmployerSubscription) {
    reasons.push("an active employer subscription");
  }
  return reasons.length
    ? `You can't switch back to candidate while the company has ${reasons.join(" and ")}.`
    : null;
}

async function loadSwitchBackState(
  query: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
) {
  const [company] = await query
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .innerJoin(
      companyMembers,
      and(
        eq(companyMembers.companyId, companies.id),
        eq(companyMembers.userId, userId),
        eq(companyMembers.status, "active"),
      ),
    )
    .where(eq(companies.ownerUserId, userId))
    .orderBy(desc(companies.createdAt))
    .limit(1);
  if (!company) throw new NotFoundError("Your employer company was not found.");

  const activeJobs = await query
    .select({ status: jobs.status })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, company.id),
        inArray(jobs.status, ["published", "pending_approval"]),
        isNull(jobs.deletedAt),
      ),
    );
  const activeSubscription = await query
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.companyId, company.id),
        eq(subscriptions.status, "active"),
        gt(subscriptions.currentPeriodEnd, new Date()),
      ),
    )
    .limit(1);
  const liveJobs = activeJobs.filter((job) => job.status === "published").length;
  const heldJobs = activeJobs.filter((job) => job.status === "pending_approval").length;
  return {
    company,
    liveJobs,
    heldJobs,
    hasActiveEmployerSubscription: activeSubscription.length > 0,
  };
}

export async function getSwitchBackBlockReason(userId: string): Promise<string | null> {
  const state = await loadSwitchBackState(db, userId);
  return switchBackReason(state);
}

export async function convertCandidateToEmployer(
  userId: string,
  input: EmployerConversionInput,
): Promise<void> {
  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      employerConversionUsed: users.employerConversionUsed,
    })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  if (!account || account.status !== "active") {
    throw new AuthorizationError("Only an active account can become an employer.");
  }
  if (account.role !== "job_seeker") {
    throw new AuthorizationError("Only candidate accounts can become employers.");
  }
  if (!account.emailVerifiedAt) {
    throw new AuthorizationError("Verify your email before becoming an employer.");
  }
  if (isDisposableEmail(account.email)) {
    throw new AppError(
      "Use a work or personal email address that is not a disposable mailbox to register a company.",
      422,
      "disposable_email",
    );
  }

  const identity = {
    normalizedName: normalizeCompanyName(input.name),
    websiteDomain: normalizeWebsiteDomain(input.website),
    normalizedContactPhone: normalizeContactPhone(input.phone),
  };
  await assertCompanyIdentityAvailable(identity);
  const slug = await uniqueCompanySlug(input.name);
  const settings = await getSiteSettings();
  const autoApprove = settings.autoApproveCompanies;
  const now = new Date();

  const created = await db.transaction(async (tx) => {
    const [freshAccount] = await tx
      .select({
        role: users.role,
        status: users.status,
        emailVerifiedAt: users.emailVerifiedAt,
        employerConversionUsed: users.employerConversionUsed,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .for("update")
      .limit(1);
    if (
      !freshAccount ||
      freshAccount.role !== "job_seeker" ||
      freshAccount.status !== "active" ||
      !freshAccount.emailVerifiedAt
    ) {
      throw new AuthorizationError("Only an active, verified candidate can become an employer.");
    }
    const [profile] = await tx
      .select({ id: candidateProfiles.id, discoverable: candidateProfiles.discoverable })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId))
      .limit(1);
    if (!profile) throw new NotFoundError("Your candidate profile was not found.");
    const visibility = candidateVisibilityForEmployer(profile.discoverable);

    const [company] = await tx
      .insert(companies)
      .values({
        ownerUserId: userId,
        name: input.name,
        normalizedName: identity.normalizedName,
        slug,
        website: input.website,
        websiteDomain: identity.websiteDomain,
        industry: input.industry,
        size: input.size,
        headquarters: input.city,
        locations: [{ city: input.city, country: "India" }],
        contactEmail: account.email,
        contactPhone: input.phone,
        normalizedContactPhone: identity.normalizedContactPhone,
        freeJobPostsUsed: conversionFreePostsUsed(
          freshAccount.employerConversionUsed,
          settings.freeJobPosts,
        ),
        status: autoApprove ? "approved" : "pending",
        ...(autoApprove ? { reviewedAt: now, verifiedAt: now } : {}),
      })
      .returning({ id: companies.id, name: companies.name });

    await tx.insert(companyMembers).values({
      companyId: company!.id,
      userId,
      role: "owner",
      status: "active",
      joinedAt: now,
    });
    await tx
      .update(candidateProfiles)
      .set({ discoverable: visibility.discoverable, updatedAt: now })
      .where(eq(candidateProfiles.id, profile.id));
    await tx
      .update(users)
      .set({
        role: "recruiter",
        employerConversionUsed: true,
        candidateDiscoverableBeforeEmployer: visibility.restoreDiscoverable,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      actorRole: "job_seeker",
      action: "user.converted_to_recruiter",
      entityType: "company",
      entityId: company!.id,
      description: `Candidate account converted to employer for ${company!.name}.`,
    });
    return company!;
  });

  const brand = await getEmailBrand();
  await queueRenderedEmail({
    to: account.email,
    toName: account.fullName,
    templateKey: "employer_conversion_confirmation",
    rendered: companyConversionConfirmationEmail({
      ownerName: account.fullName,
      companyName: created.name,
      approved: autoApprove,
      brand,
    }),
    metadata: { userId, companyId: created.id },
  });
  if (autoApprove) {
    await queueRenderedEmail({
      to: account.email,
      toName: account.fullName,
      templateKey: "company_verification_approved",
      rendered: companyVerificationApprovedEmail({
        ownerName: account.fullName,
        companyName: created.name,
        brand,
      }),
      metadata: { userId, companyId: created.id },
    });
  } else {
    await queueRenderedEmail({
      to: account.email,
      toName: account.fullName,
      templateKey: "company_verification_submitted",
      rendered: companyVerificationSubmittedEmail({
        ownerName: account.fullName,
        companyName: created.name,
        brand,
      }),
      metadata: { userId, companyId: created.id },
    });
  }
}

export async function switchEmployerBackToCandidate(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select({
        role: users.role,
        candidateDiscoverableBeforeEmployer: users.candidateDiscoverableBeforeEmployer,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .for("update")
      .limit(1);
    if (!account || account.role !== "recruiter") {
      throw new AuthorizationError("Only employer accounts can switch back to candidate.");
    }
    const state = await loadSwitchBackState(tx, userId);
    const reason = switchBackReason(state);
    if (reason) throw new AppError(reason, 409, "employer_account_in_use");

    const now = new Date();
    await tx
      .update(companyMembers)
      .set({ status: "removed", updatedAt: now })
      .where(
        and(
          eq(companyMembers.companyId, state.company.id),
          eq(companyMembers.userId, userId),
          eq(companyMembers.status, "active"),
        ),
      );
    await tx
      .update(users)
      .set({
        role: "job_seeker",
        candidateDiscoverableBeforeEmployer: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    await tx
      .update(candidateProfiles)
      .set({
        discoverable: candidateVisibilityForCandidate(
          account.candidateDiscoverableBeforeEmployer,
        ),
        updatedAt: now,
      })
      .where(eq(candidateProfiles.userId, userId));
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      actorRole: "recruiter",
      action: "user.switched_back_to_candidate",
      entityType: "company",
      entityId: state.company.id,
      description: "Employer account switched back to candidate.",
    });
  });
}
