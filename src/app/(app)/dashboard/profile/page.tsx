import { requireUser } from "@/lib/auth/current-user";
import { computeCompleteness, ensureCandidateProfile } from "@/lib/candidate/profile";
import { ProfileForm } from "@/components/candidate/profile-form";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import Link from "next/link";
import { getCandidateEntitlements } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  await ensureCandidateProfile(user.id);
  const completeness = await computeCompleteness(user.id);
  const entitlements = await getCandidateEntitlements(user.id);
  const isPremium = entitlements.get("resume_builder")?.enabled ?? false;

  const { db } = await import("@/lib/db");
  const { candidateProfiles } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const profile = (
    await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, user.id))
      .limit(1)
  ).at(0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My profile"
        description="This is what recruiters see when they review your application."
        action={
          <div className="flex items-center gap-2">
            {isPremium ? <Badge tone="success">Premium</Badge> : null}
            <Badge tone={completeness >= 80 ? "success" : "warning"}>{completeness}% complete</Badge>
          </div>
        }
      />

      <Card>
        <p className="text-sm text-slate-600">
          Education, work experience and skills are added from your profile editor.
          A complete profile roughly doubles the callbacks you get.
        </p>
      </Card>
      {!isPremium ? (
        <Card className="border-royal/20 bg-royal/5">
          <h2 className="font-semibold text-navy">Unlock Candidate Premium</h2>
          <p className="mt-1 text-sm text-slate-600">
            Get the premium Resume Builder, a Premium badge recruiters can see, and priority placement among equally matched candidates.
          </p>
          <Link className="mt-3 inline-block text-sm font-semibold text-royal hover:underline" href="/pricing?audience=candidate">
            Explore candidate plans
          </Link>
        </Card>
      ) : null}

      <ProfileForm
        values={{
          headline: profile?.headline ?? null,
          summary: profile?.summary ?? null,
          currentLocation: profile?.currentLocation ?? null,
          currentCompany: profile?.currentCompany ?? null,
          currentDesignation: profile?.currentDesignation ?? null,
          totalExperienceMonths: profile?.totalExperienceMonths ?? null,
          noticePeriodDays: profile?.noticePeriodDays ?? null,
          expectedSalaryLpa:
            profile?.expectedSalaryPaise != null
              ? Number((profile.expectedSalaryPaise / 100_000_00).toFixed(2))
              : null,
          preferredLocations: profile?.preferredLocations ?? [],
          discoverable: profile?.discoverable ?? false,
        }}
      />
    </div>
  );
}
