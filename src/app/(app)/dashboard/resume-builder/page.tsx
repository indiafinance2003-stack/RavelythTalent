import Link from "next/link";
import { Alert, Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { BuiltResumeForm } from "@/components/candidate/built-resume-form";
import { requireRole } from "@/lib/auth/current-user";
import { formatIndianDateTime } from "@/lib/utils";
import {
  builtResumeDataFromRecord,
  candidateResumeBuilderAccess,
  emptyBuiltResumeData,
  getBuiltResumeVersions,
  isResumeTemplate,
  listBuiltResumes,
} from "@/lib/candidate/builder";
import {
  deleteBuiltResumeAction,
  setPrimaryBuiltResumeAction,
} from "@/lib/candidate/builder-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; new?: string }>;

export default async function ResumeBuilderPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireRole("job_seeker");
  const params = await searchParams;
  const [access, resumes] = await Promise.all([
    candidateResumeBuilderAccess(user.id),
    listBuiltResumes(user.id),
  ]);
  const selected = params.id
    ? resumes.find((resume) => resume.id === params.id)
    : undefined;
  const creating = params.new === "1";
  const selectedData = selected
    ? builtResumeDataFromRecord(selected.data)
    : emptyBuiltResumeData();
  const versions = selected && access.premium
    ? await getBuiltResumeVersions(selected.id, user.id)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resume Builder"
        description="Create and keep your resume versions in one place."
        action={
          <ButtonLink href="/dashboard/resume-builder?new=1">
            Create a resume
          </ButtonLink>
        }
      />
      {!access.premium ? (
        <Alert tone="info" title="Free plan preview">
          You can create one basic resume and preview its layout. Career Pro unlocks
          professional templates, saved history, and PDF downloads.
        </Alert>
      ) : null}

      {params.id && !selected ? (
        <Alert tone="error">That resume was not found in your account.</Alert>
      ) : null}

      {creating || selected ? (
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy">
                {selected ? "Edit resume" : "New resume"}
              </h2>
              {selected && access.premium ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {versions.map((version) => (
                  <Link
                    key={version.id}
                    href={`/api/files/built-resumes/${selected.id}?version=${version.version}`}
                    className="inline-flex"
                  >
                    <Badge tone="neutral">
                    Version {version.version}
                    </Badge>
                  </Link>
                ))}
              </div>
              ) : null}
            </div>
            {selected && access.premium ? (
              <a
                className="text-sm font-semibold text-royal hover:underline"
                href={`/api/files/built-resumes/${selected.id}`}
              >
                Download latest PDF
              </a>
            ) : null}
          </div>
          <BuiltResumeForm
            resumeId={selected?.id}
            title={selected?.title ?? ""}
            template={
              selected && isResumeTemplate(selected.templateKey)
                ? selected.templateKey
                : "classic"
            }
            data={selectedData}
            premium={access.premium}
            professionalTemplates={access.professionalTemplates}
          />
        </Card>
      ) : null}

      {creating || selected ? (
        <Card className="mx-auto w-full max-w-3xl border border-slate-200 bg-white">
          <p className="mb-5 text-xs font-bold uppercase tracking-widest text-slate-500">
            {access.premium ? "Resume preview" : "Basic template preview"}
          </p>
          <h2 className="text-2xl font-extrabold text-navy">
            {selectedData.fullName || "Your name"}
          </h2>
          {selectedData.headline ? (
            <p className="mt-1 font-semibold text-teal-700">{selectedData.headline}</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-600">
            {[selectedData.email, selectedData.phone, selectedData.location].filter(Boolean).join(" · ") ||
              "Add your email, phone, and location"}
          </p>
          {(
            [
              ["Professional summary", selectedData.summary],
              ["Experience", selectedData.experience],
              ["Education", selectedData.education],
              ["Skills", selectedData.skills],
            ] as const
          ).map(([label, value]) => (
            <section key={label} className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-royal">{label}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {value || `Your ${label.toLowerCase()} will appear here.`}
              </p>
            </section>
          ))}
        </Card>
      ) : null}

      {resumes.length === 0 && !creating ? (
        <EmptyState
          title="No built resumes yet"
          description="Start with a basic preview, then upgrade when you need premium templates and PDF exports."
          action={<ButtonLink href="/dashboard/resume-builder?new=1">Create your first resume</ButtonLink>}
        />
      ) : null}

      {resumes.length > 0 ? (
        <div className="grid gap-4">
          {resumes.map((resume) => (
            <Card key={resume.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-navy">{resume.title}</h2>
                  {resume.isPrimary ? <Badge tone="success">Primary</Badge> : null}
                  <Badge>{resume.templateKey}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Updated {formatIndianDateTime(resume.updatedAt)}
                  {access.premium ? ` · ${resume.currentVersion} saved version${resume.currentVersion === 1 ? "" : "s"}` : " · Preview"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="text-sm font-semibold text-royal hover:underline" href={`/dashboard/resume-builder?id=${resume.id}`}>
                  Edit
                </Link>
                {access.premium ? (
                  <a className="text-sm font-semibold text-royal hover:underline" href={`/api/files/built-resumes/${resume.id}`}>
                    PDF
                  </a>
                ) : null}
                {!resume.isPrimary ? (
                  <form action={setPrimaryBuiltResumeAction}>
                    <input type="hidden" name="resumeId" value={resume.id} />
                    <button className="text-sm font-semibold text-navy hover:underline" type="submit">Set primary</button>
                  </form>
                ) : null}
                <form action={deleteBuiltResumeAction}>
                  <input type="hidden" name="resumeId" value={resume.id} />
                  <button className="text-sm font-semibold text-red-700 hover:underline" type="submit">Delete</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
