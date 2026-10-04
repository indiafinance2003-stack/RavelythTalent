"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiRole, requireApiVerifiedUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { assertSameOrigin } from "@/lib/security";
import {
  acceptTeamInvitation,
  inviteCompanyMember,
  removeCompanyMember,
} from "./team";

const inviteSchema = z.object({
  companyId: z.uuid(),
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "recruiter"]),
});

export async function inviteCompanyMemberAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiRole("recruiter");
  const parsed = inviteSchema.safeParse({
    companyId: formData.get("companyId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid invitation.", 422);
  await inviteCompanyMember({
    actorId: user.id,
    companyId: parsed.data.companyId,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  revalidatePath("/recruiter/team");
}

const removeSchema = z.object({
  companyId: z.uuid(),
  memberId: z.uuid(),
});

export async function removeCompanyMemberAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiRole("recruiter");
  const parsed = removeSchema.safeParse({
    companyId: formData.get("companyId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message ?? "Invalid team member.", 422);
  await removeCompanyMember({
    actorId: user.id,
    companyId: parsed.data.companyId,
    memberId: parsed.data.memberId,
  });
  revalidatePath("/recruiter/team");
}

const acceptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function acceptTeamInvitationAction(formData: FormData): Promise<void> {
  await assertSameOrigin();
  const user = await requireApiVerifiedUser();
  if (user.role !== "recruiter") {
    throw new AppError("Use a verified recruiter account to accept this invitation.", 403, "recruiter_account_required");
  }
  const parsed = acceptSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) throw new AppError("Invitation token is invalid.", 422);
  await acceptTeamInvitation({
    userId: user.id,
    email: user.email,
    token: parsed.data.token,
  });
  revalidatePath("/recruiter");
  revalidatePath("/recruiter/team");
}
