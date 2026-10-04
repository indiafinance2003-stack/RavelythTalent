import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current-user";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { acceptTeamInvitationAction } from "@/lib/recruiter/team-actions";
import { getTeamInvitation } from "@/lib/recruiter/team";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accept team invitation" };

export default async function AcceptTeamInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const user = await requireUser("/recruiter/team/accept");
  const { token } = await searchParams;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return <EmptyState title="Invalid invitation" description="This invitation link is invalid." />;
  }
  const invitation = await getTeamInvitation(token);
  if (!invitation) {
    return <EmptyState title="Invitation expired" description="Ask the company owner to send a new invitation." />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader title="Accept team invitation" />
      <Card>
        <p className="text-sm text-slate-700">
          You are signed in as <strong>{user.email}</strong>. This invitation is for{" "}
          <strong>{invitation.invitedEmail}</strong> to join <strong>{invitation.companyName}</strong> as a {invitation.role}.
        </p>
        {user.role !== "recruiter" ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">Sign in with a verified recruiter account using the invited email to accept.</p>
        ) : user.email.toLowerCase() !== invitation.invitedEmail?.toLowerCase() ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">This is not the email address that received the invitation.</p>
        ) : (
          <form action={acceptTeamInvitationAction} className="mt-5">
            <input name="token" type="hidden" value={token} />
            <button className="rounded-lg bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy" type="submit">Accept invitation</button>
          </form>
        )}
      </Card>
    </div>
  );
}
