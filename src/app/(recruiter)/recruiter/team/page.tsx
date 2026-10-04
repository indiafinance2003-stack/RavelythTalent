import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/current-user";
import { getCompanyPlan } from "@/lib/entitlements";
import { resolveRecruiterCompany } from "@/lib/recruiter/service";
import { inviteCompanyMemberAction, removeCompanyMemberAction } from "@/lib/recruiter/team-actions";
import { listCompanyTeam } from "@/lib/recruiter/team";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Company team" };

export default async function RecruiterTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser("/recruiter/team");
  const { company: companyIdParam } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);
  if (!company) return <EmptyState title="Set up your company first" description="Create a company profile before inviting your team." />;
  if (company.status !== "approved") {
    return <EmptyState title="Company approval required" description="Team invitations are available after company verification." />;
  }
  const plan = await getCompanyPlan(company.id);
  if (!plan?.features.get("team_management")?.enabled) {
    return (
      <div className="space-y-6">
        <PageHeader title="Company team" description={`Manage recruiters for ${company.name}.`} />
        <Card><p className="text-sm font-semibold text-navy">Team management requires an eligible active plan.</p></Card>
      </div>
    );
  }
  const members = await listCompanyTeam(user.id, company.id);
  return (
    <div className="space-y-6">
      <PageHeader title="Company team" description={`Invite and manage team members at ${company.name}.`} />
      <Card>
        <h2 className="mb-4 text-base font-bold text-navy">Invite a teammate</h2>
        <form action={inviteCompanyMemberAction} className="grid gap-3 md:grid-cols-3">
          <input name="companyId" type="hidden" value={company.id} />
          <label className="text-sm font-medium text-navy">
            Email
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={254} name="email" required type="email" />
          </label>
          <label className="text-sm font-medium text-navy">
            Role
            <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" name="role">
              <option value="recruiter">Recruiter</option>
              <option value="admin">Company admin</option>
            </select>
          </label>
          <button className="self-end rounded-lg bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy" type="submit">Send invitation</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Invitations expire after seven days. The invited person must use a verified recruiter account with the invited email.</p>
      </Card>
      {members.length === 0 ? <EmptyState title="No team members" description="Company members will appear here." /> : members.map((member) => (
        <Card className="flex flex-wrap items-center justify-between gap-3" key={member.id}>
          <div>
            <p className="font-semibold text-navy">{member.fullName ?? member.invitedEmail ?? member.email ?? "Member"}</p>
            <p className="text-sm text-slate-600">{member.role} · {member.status}{member.email ? ` · ${member.email}` : ""}</p>
            <p className="mt-1 text-xs text-slate-500">Added {member.createdAt.toLocaleDateString("en-IN")}</p>
          </div>
          {member.role !== "owner" && member.status !== "removed" ? (
            <form action={removeCompanyMemberAction}>
              <input name="companyId" type="hidden" value={company.id} />
              <input name="memberId" type="hidden" value={member.id} />
              <button className="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" type="submit">{member.status === "invited" ? "Cancel invitation" : "Remove"}</button>
            </form>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
