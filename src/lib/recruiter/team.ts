import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  companies,
  companyMembers,
  users,
} from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getEmailBrand, queueRenderedEmail } from "@/lib/email/send";
import { teamInvitationEmail } from "@/lib/email/templates/recruiter";
import { appUrl } from "@/lib/email/urls";
import { hasCompanyFeature, requireCompanyMembership } from "@/lib/entitlements";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listCompanyTeam(userId: string, companyId: string) {
  await requireCompanyMembership(userId, companyId, "admin");
  return db.select({
    id: companyMembers.id,
    userId: companyMembers.userId,
    email: users.email,
    invitedEmail: companyMembers.invitedEmail,
    fullName: users.fullName,
    role: companyMembers.role,
    status: companyMembers.status,
    createdAt: companyMembers.createdAt,
  })
    .from(companyMembers)
    .leftJoin(users, eq(users.id, companyMembers.userId))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(desc(companyMembers.createdAt))
    .limit(100);
}

export async function inviteCompanyMember(params: {
  actorId: string;
  companyId: string;
  email: string;
  role: "admin" | "recruiter";
}): Promise<void> {
  await requireCompanyMembership(params.actorId, params.companyId, "admin");
  if (!await hasCompanyFeature(params.companyId, "team_management")) {
    throw new AppError("Team management is not included in your current plan.", 403, "feature_not_in_plan");
  }
  const [company] = await db.select({
    id: companies.id,
    name: companies.name,
    status: companies.status,
  }).from(companies).where(eq(companies.id, params.companyId)).limit(1);
  if (!company || company.status !== "approved") {
    throw new AppError("Company approval is required to invite team members.", 403, "company_not_approved");
  }

  const email = params.email.trim().toLowerCase();
  const [existingUser] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, email)).limit(1);
  const membershipCondition = existingUser
    ? or(
        eq(companyMembers.userId, existingUser.id),
        eq(companyMembers.invitedEmail, email),
      )
    : eq(companyMembers.invitedEmail, email);
  const existingMembership = await db.select()
    .from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, params.companyId),
      membershipCondition!,
    ))
    .limit(1);
  const membership = existingMembership[0];
  if (membership?.status === "active") {
    throw new AppError("This person is already on your company team.", 409, "already_member");
  }

  const token = randomBytes(32).toString("hex");
  const hash = tokenHash(token);
  const now = new Date();
  if (membership?.status === "invited") {
    if (membership.createdAt.getTime() + INVITE_TTL_MS > now.getTime()) {
      throw new AppError("An invitation is already pending for this email.", 409, "invite_pending");
    }
    await db.update(companyMembers)
      .set({
        userId: null,
        invitedEmail: email,
        role: params.role,
        invitedByUserId: params.actorId,
        inviteTokenHash: hash,
        createdAt: now,
        updatedAt: now,
      })
      .where(eq(companyMembers.id, membership.id));
  } else {
    if (membership?.status === "removed") {
      await db.update(companyMembers)
        .set({
          userId: null,
          invitedEmail: email,
          role: params.role,
          status: "invited",
          invitedByUserId: params.actorId,
          inviteTokenHash: hash,
          joinedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .where(eq(companyMembers.id, membership.id));
    } else {
      await db.insert(companyMembers).values({
        companyId: params.companyId,
        userId: null,
        invitedEmail: email,
        role: params.role,
        status: "invited",
        invitedByUserId: params.actorId,
        inviteTokenHash: hash,
      });
    }
  }

  await db.insert(auditLogs).values({
    actorUserId: params.actorId,
    actorRole: "recruiter",
    action: "company_member.invited",
    entityType: "company",
    entityId: params.companyId,
    description: `${email} was invited to ${company.name} as ${params.role}.`,
  });

  try {
    const brand = await getEmailBrand();
    await queueRenderedEmail({
      to: email,
      templateKey: "team_invitation",
      rendered: teamInvitationEmail({
        companyName: company.name,
        role: params.role,
        inviteUrl: appUrl(`/recruiter/team/accept?token=${encodeURIComponent(token)}`),
        brand,
      }),
      metadata: { companyId: params.companyId },
    });
  } catch (error) {
    console.error("[recruiter] could not queue team invitation:", error);
  }
}

export async function getTeamInvitation(token: string) {
  const hash = tokenHash(token);
  const [invitation] = await db.select({
    id: companyMembers.id,
    companyId: companyMembers.companyId,
    companyName: companies.name,
    invitedEmail: companyMembers.invitedEmail,
    role: companyMembers.role,
    status: companyMembers.status,
    createdAt: companyMembers.createdAt,
    companyStatus: companies.status,
  })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(and(
      eq(companyMembers.inviteTokenHash, hash),
      eq(companyMembers.status, "invited"),
    ))
    .limit(1);
  if (
    !invitation ||
    invitation.companyStatus !== "approved" ||
    invitation.createdAt.getTime() + INVITE_TTL_MS < Date.now()
  ) return null;
  return invitation;
}

export async function acceptTeamInvitation(params: {
  userId: string;
  email: string;
  token: string;
}): Promise<void> {
  const invitation = await getTeamInvitation(params.token);
  if (!invitation) throw new AppError("Invitation is invalid or expired.", 404, "invite_not_found");
  if (invitation.invitedEmail?.toLowerCase() !== params.email.toLowerCase()) {
    throw new AppError("Sign in with the email address that received this invitation.", 403, "invite_email_mismatch");
  }
  const [existing] = await db.select({ id: companyMembers.id })
    .from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, invitation.companyId),
      eq(companyMembers.userId, params.userId),
      eq(companyMembers.status, "active"),
    ))
    .limit(1);
  if (existing) throw new AppError("You are already a member of this company.", 409, "already_member");

  const [accepted] = await db.update(companyMembers)
    .set({
      userId: params.userId,
      invitedEmail: null,
      status: "active",
      joinedAt: new Date(),
      inviteTokenHash: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(companyMembers.id, invitation.id),
      eq(companyMembers.status, "invited"),
      eq(companyMembers.inviteTokenHash, tokenHash(params.token)),
    ))
    .returning({ id: companyMembers.id });
  if (!accepted) throw new AppError("Invitation was already used.", 409, "invite_used");
  await db.insert(auditLogs).values({
    actorUserId: params.userId,
    actorRole: "recruiter",
    action: "company_member.joined",
    entityType: "company",
    entityId: invitation.companyId,
    description: `Joined ${invitation.companyName} as a ${invitation.role}.`,
  });
}

export async function removeCompanyMember(params: {
  actorId: string;
  companyId: string;
  memberId: string;
}): Promise<void> {
  await requireCompanyMembership(params.actorId, params.companyId, "admin");
  if (!await hasCompanyFeature(params.companyId, "team_management")) {
    throw new AppError("Team management is not included in your current plan.", 403, "feature_not_in_plan");
  }
  const [member] = await db.select({
    userId: companyMembers.userId,
    role: companyMembers.role,
    invitedEmail: companyMembers.invitedEmail,
  })
    .from(companyMembers)
    .where(and(
      eq(companyMembers.id, params.memberId),
      eq(companyMembers.companyId, params.companyId),
      inArray(companyMembers.status, ["active", "invited"]),
    ))
    .limit(1);
  if (!member || member.role === "owner" || member.userId === params.actorId) {
    throw new AppError("This team member cannot be removed.", 403, "cannot_remove_member");
  }
  await db.update(companyMembers)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(companyMembers.id, params.memberId));
  await db.insert(auditLogs).values({
    actorUserId: params.actorId,
    actorRole: "recruiter",
    action: "company_member.removed",
    entityType: "company",
    entityId: params.companyId,
    description: `${member.invitedEmail ?? member.userId ?? "Member"} was removed from the team.`,
  });
}
