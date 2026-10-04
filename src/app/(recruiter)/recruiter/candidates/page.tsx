import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  candidateProfiles,
  resumes,
  savedCandidates,
  users,
} from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { getCompanyPlan } from "@/lib/entitlements";
import { resolveRecruiterCompany } from "@/lib/recruiter/service";
import { saveCandidateAction } from "@/lib/recruiter/candidate-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Candidate search" };

export default async function RecruiterCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; q?: string }>;
}) {
  const user = await requireUser("/recruiter/candidates");
  const { company: companyIdParam, q: rawQuery } = await searchParams;
  const company = await resolveRecruiterCompany(user.id, companyIdParam);
  if (!company) {
    return <EmptyState title="Set up your company first" description="Candidate search is available to approved employer accounts." />;
  }
  if (company.status !== "approved") {
    return <EmptyState title="Company approval required" description="Candidate search is only available to approved employer accounts." />;
  }

  const plan = await getCompanyPlan(company.id);
  if (!plan?.features.get("candidate_search")?.enabled || !plan.features.get("resume_database")?.enabled) {
    return (
      <div className="space-y-6">
        <PageHeader title="Candidate search" description="Discover candidates who opted in to recruiter search." />
        <Card>
          <p className="font-semibold text-navy">Candidate search requires an eligible active plan.</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-royal hover:underline" href="/pricing?audience=employer">Compare employer plans</Link>
        </Card>
      </div>
    );
  }

  const query = rawQuery?.trim().slice(0, 100) ?? "";
  const conditions = [
    eq(candidateProfiles.discoverable, true),
    eq(users.role, "job_seeker"),
    eq(users.status, "active"),
    isNull(users.deletedAt),
  ];
  if (query) {
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(or(
      ilike(users.fullName, pattern),
      ilike(candidateProfiles.headline, pattern),
      ilike(candidateProfiles.summary, pattern),
      ilike(candidateProfiles.currentLocation, pattern),
    )!);
  }
  const [candidates, savedRows, settings] = await Promise.all([
    db.select({
      userId: users.id,
      fullName: users.fullName,
      headline: candidateProfiles.headline,
      summary: candidateProfiles.summary,
      location: candidateProfiles.currentLocation,
      experienceMonths: candidateProfiles.totalExperienceMonths,
      profileCompleteness: candidateProfiles.profileCompleteness,
    })
      .from(candidateProfiles)
      .innerJoin(users, eq(users.id, candidateProfiles.userId))
      .where(and(...conditions))
      .orderBy(asc(users.fullName))
      .limit(50),
    db.select({ candidateUserId: savedCandidates.candidateUserId })
      .from(savedCandidates)
      .where(eq(savedCandidates.companyId, company.id)),
    getSiteSettings(),
  ]);
  const savedIds = new Set(savedRows.map((row) => row.candidateUserId));
  const resumeRows = candidates.length > 0
    ? await db.select({
        id: resumes.id,
        userId: resumes.userId,
        isDefault: resumes.isDefault,
      })
        .from(resumes)
        .where(and(
          inArray(resumes.userId, candidates.map((candidate) => candidate.userId)),
          isNull(resumes.deletedAt),
        ))
        .orderBy(asc(resumes.isDefault))
    : [];
  const resumeByUser = new Map<string, string>();
  for (const resume of resumeRows) {
    if (!resumeByUser.has(resume.userId) || resume.isDefault) resumeByUser.set(resume.userId, resume.id);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Candidate search" description={`Search discoverable candidates as ${company.name}. Resume views are limited to ${settings.resumeDbViewLimit} per recruiter per month.`} />
      <form className="flex flex-wrap gap-2" method="get">
        <input name="company" type="hidden" value={company.id} />
        <label className="sr-only" htmlFor="candidate-query">Search candidates</label>
        <input className="min-w-60 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm" defaultValue={query} id="candidate-query" maxLength={100} name="q" placeholder="Name, role, skills or location" />
        <button className="rounded-xl bg-royal px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy" type="submit">Search</button>
      </form>
      {candidates.length === 0 ? (
        <EmptyState title="No discoverable candidates found" description="Try another search. Candidate details appear only for people who opted in." />
      ) : candidates.map((candidate) => {
        const resumeId = resumeByUser.get(candidate.userId);
        const isSaved = savedIds.has(candidate.userId);
        return (
          <Card className="flex flex-wrap items-start justify-between gap-4" key={candidate.userId}>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-navy">{candidate.fullName}</h2>
              <p className="text-sm text-slate-600">{candidate.headline ?? "Candidate"}{candidate.location ? ` · ${candidate.location}` : ""}</p>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{candidate.summary?.slice(0, 400) || "No profile summary provided."}</p>
              <p className="mt-2 text-xs text-slate-500">
                {candidate.experienceMonths !== null ? `${(candidate.experienceMonths / 12).toFixed(1)} years experience` : "Experience not specified"}
                {` · Profile ${candidate.profileCompleteness}% complete`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {resumeId ? (
                <Link className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-navy hover:border-royal" href={`/api/files/resumes/${resumeId}`} rel="noreferrer" target="_blank">View resume</Link>
              ) : null}
              {plan.features.get("saved_candidates")?.enabled ? (
                <form action={saveCandidateAction}>
                  <input name="companyId" type="hidden" value={company.id} />
                  <input name="candidateUserId" type="hidden" value={candidate.userId} />
                  <input name="action" type="hidden" value={isSaved ? "remove" : "save"} />
                  <button className="rounded-lg bg-royal px-3 py-2 text-xs font-semibold text-white hover:bg-navy" type="submit">{isSaved ? "Remove saved" : "Save candidate"}</button>
                </form>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
