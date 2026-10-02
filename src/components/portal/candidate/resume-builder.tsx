'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { portalGet, portalSend } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type { CandidateDetails, CandidateProfile, ResumeSummary, ResumeVersion } from '@/lib/portal-client/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';

/**
 * Resume Builder.
 *
 * IMPORTANT AND DELIBERATE: a builder document is stored against an existing
 * uploaded VERSION, because that is the backend's real model ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â every version has
 * a stored file, and there is no "content with no document". The builder
 * therefore lets you pick one of your uploaded versions and keeps its structured
 * content attached to it. It does not pretend to generate a PDF: the download
 * button fetches the actual stored document through the authorised endpoint.
 *
 * The preview renders from the same structured content, using React text nodes
 * only. Nothing here interprets HTML, so builder content can never inject markup
 * into the page.
 */

interface BuilderContent {
  headline: string;
  summary: string;
  skills: string;
  experience: Array<{ title: string; company: string; period: string; description: string }>;
  education: Array<{ institution: string; detail: string }>;
}

const EMPTY: BuilderContent = {
  headline: '',
  summary: '',
  skills: '',
  experience: [],
  education: [],
};

export function ResumeBuilder(): React.ReactElement {
  const searchParams = useSearchParams();
  const requestedResumeId = searchParams.get('resumeId');
  const requestedVersionId = searchParams.get('versionId');

  const resumes = useAsync(
    () => portalGet<{ resumes: ResumeSummary[] }>('/api/portal/candidate/resumes'),
    []
  );
  const profile = useAsync(
    () => portalGet<{ profile: CandidateProfile }>('/api/portal/candidate/profile'),
    []
  );
  const details = useAsync(() => portalGet<CandidateDetails>('/api/portal/candidate/details'), []);

  const [resumeId, setResumeId] = useState<string | null>(requestedResumeId);
  const [versionId, setVersionId] = useState<string | null>(requestedVersionId);
  const versions = useAsync(
    () =>
      resumeId
        ? portalGet<{ versions: ResumeVersion[] }>(`/api/portal/candidate/resumes/${resumeId}/versions`)
        : Promise.resolve({ versions: [] }),
    [resumeId]
  );

  const [content, setContent] = useState<BuilderContent>(EMPTY);
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const activeVersionId = versionId ?? versions.data?.versions[0]?.id ?? null;

  // Load stored content for the selected version exactly once per version, and
  // never overwrite edits in progress with a stale re-fetch.
  useEffect(() => {
    if (!activeVersionId || loadedVersion === activeVersionId) return;
    const found = versions.data?.versions.find((version) => version.id === activeVersionId);
    if (!found) return;

    setContent(readContent(found, profile.data?.profile, details.data));
    setLoadedVersion(activeVersionId);
  }, [activeVersionId, versions.data, profile.data, details.data, loadedVersion]);

  const canSave = Boolean(activeVersionId) && loadedVersion === activeVersionId;

  async function save(): Promise<void> {
    if (!activeVersionId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await portalSend(
        'PUT',
        `/api/portal/candidate/resumes/versions/${activeVersionId}/content`,
        { content: content as unknown as Record<string, unknown> }
      );
      await versions.reload();
      setMessage('Your resume content has been saved to this version.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (resumes.loading || profile.loading || details.loading) {
    return <LoadingState label="Loading the Resume BuilderÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦" />;
  }
  if (resumes.error) return <ErrorState message={resumes.error} onRetry={resumes.reload} />;

  const resumeList = resumes.data?.resumes ?? [];

  if (resumeList.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Resume Builder" title="Build a resume" />
        <EmptyState
          title="Create a resume and upload a document first"
          description="Ravelyth stores every resume version as a real document, so the builder attaches your structured content to a version you have uploaded."
          action={
            <Link
              href="/candidate/resumes"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
            >
              Go to my resumes
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resume Builder"
        title="Build a resume"
        description="Compose a focused resume for a specific role. Saving attaches your content to the selected document version."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPreview((value) => !value)}>
              {preview ? 'Back to editing' : 'Preview'}
            </Button>
            <Button onClick={save} loading={saving} disabled={!canSave}>
              Save content
            </Button>
          </div>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <CardHeader
          title="Which document are you building on?"
          description="Each version is a stored file. Choose the one this content belongs to."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Resume" htmlFor="builder-resume">
            <select
              id="builder-resume"
              className={inputClass}
              value={resumeId ?? ''}
              onChange={(event) => {
                setResumeId(event.target.value);
                setVersionId(null);
                setLoadedVersion(null);
                setMessage(null);
              }}
            >
              {resumeList.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.label}
                  {resume.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Version" htmlFor="builder-version">
            <select
              id="builder-version"
              className={inputClass}
              value={activeVersionId ?? ''}
              onChange={(event) => {
                setVersionId(event.target.value);
                setLoadedVersion(null);
                setMessage(null);
              }}
              disabled={(versions.data?.versions.length ?? 0) === 0}
            >
              {(versions.data?.versions ?? []).length === 0 ? (
                <option value="">No versions uploaded</option>
              ) : null}
              {(versions.data?.versions ?? []).map((version) => (
                <option key={version.id} value={version.id}>
                  Version {version.versionNumber} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â {version.originalFilename}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      {(versions.data?.versions.length ?? 0) === 0 && resumeId ? (
        <Alert kind="warning">
          This resume has no uploaded document yet, so there is no version to attach content to.{' '}
          <Link href="/candidate/resumes" className="underline">
            Upload a PDF, DOC or DOCX
          </Link>{' '}
          first.
        </Alert>
      ) : null}

      {preview ? (
        <ResumePreview content={content} name={profile.data?.profile.fullName ?? ''} />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Introduction" />
            <div className="space-y-4 p-5">
              <Field label="Headline" htmlFor="b-headline" hint="One line: what you do.">
                <input
                  id="b-headline"
                  className={inputClass}
                  value={content.headline}
                  onChange={(event) =>
                    setContent((c) => ({ ...c, headline: event.target.value }))
                  }
                />
              </Field>
              <Field label="Summary" htmlFor="b-summary" hint="Two or three focused sentences.">
                <textarea
                  id="b-summary"
                  rows={4}
                  className={inputClass}
                  value={content.summary}
                  onChange={(event) =>
                    setContent((c) => ({ ...c, summary: event.target.value }))
                  }
                />
              </Field>
              <Field label="Skills for this role" htmlFor="b-skills" hint="Comma separated.">
                <textarea
                  id="b-skills"
                  rows={2}
                  className={inputClass}
                  value={content.skills}
                  onChange={(event) => setContent((c) => ({ ...c, skills: event.target.value }))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Experience"
              description="Copied from your profile. Edit here without changing your profile."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setContent((c) => ({
                      ...c,
                      experience: [
                        ...c.experience,
                        { title: '', company: '', period: '', description: '' },
                      ],
                    }))
                  }
                >
                  Add role
                </Button>
              }
            />
            <div className="space-y-4 p-5">
              {content.experience.length === 0 ? (
                <EmptyState title="No roles on this resume yet" />
              ) : null}
              {content.experience.map((item, index) => (
                <fieldset key={index} className="rounded-lg border border-line p-4">
                  <legend className="px-1 text-xs font-medium text-slate-400">
                    Role {index + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      aria-label="Job title"
                      className={inputClass}
                      value={item.title}
                      placeholder="Job title"
                      onChange={(event) => updateExperience(index, 'title', event.target.value)}
                    />
                    <input
                      aria-label="Company"
                      className={inputClass}
                      value={item.company}
                      placeholder="Company"
                      onChange={(event) => updateExperience(index, 'company', event.target.value)}
                    />
                    <input
                      aria-label="Period"
                      className={inputClass}
                      value={item.period}
                      placeholder="2023 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Present"
                      onChange={(event) => updateExperience(index, 'period', event.target.value)}
                    />
                  </div>
                  <textarea
                    aria-label="What you did"
                    rows={2}
                    className={`${inputClass} mt-3`}
                    value={item.description}
                    onChange={(event) => updateExperience(index, 'description', event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setContent((c) => ({
                        ...c,
                        experience: c.experience.filter((_, position) => position !== index),
                      }))
                    }
                    className="mt-2"
                  >
                    Remove this role
                  </Button>
                </fieldset>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Education"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setContent((c) => ({
                      ...c,
                      education: [...c.education, { institution: '', detail: '' }],
                    }))
                  }
                >
                  Add education
                </Button>
              }
            />
            <div className="space-y-3 p-5">
              {content.education.length === 0 ? (
                <EmptyState title="No education on this resume yet" />
              ) : null}
              {content.education.map((item, index) => (
                <div key={index} className="grid gap-3 sm:grid-cols-2">
                  <input
                    aria-label="Institution"
                    className={inputClass}
                    value={item.institution}
                    placeholder="Institution"
                    onChange={(event) => updateEducation(index, 'institution', event.target.value)}
                  />
                  <input
                    aria-label="Detail"
                    className={inputClass}
                    value={item.detail}
                    placeholder="B.Tech Computer Science, 2021"
                    onChange={(event) => updateEducation(index, 'detail', event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setContent((c) => ({
                        ...c,
                        education: c.education.filter((_, position) => position !== index),
                      }))
                    }
                    className="sm:col-span-2"
                  >
                    Remove this entry
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader title="Download" description="Downloads the stored document for the selected version." />
        <div className="p-5">
          {activeVersionId ? (
            <Link
              href={`/api/portal/candidate/resumes/versions/${activeVersionId}`}
              className="inline-block rounded-md border border-line px-4 py-2 text-sm font-medium text-slate-300 hover:border-accent hover:text-accent"
            >
              Download the document
            </Link>
          ) : (
            <p className="text-sm text-slate-500">
              Upload a document to enable downloads.
            </p>
          )}
        </div>
      </Card>
    </div>
  );

  function updateExperience(
    index: number,
    key: 'title' | 'company' | 'period' | 'description',
    value: string
  ): void {
    setContent((c) => ({
      ...c,
      experience: c.experience.map((item, position) =>
        position === index ? { ...item, [key]: value } : item
      ),
    }));
  }

  function updateEducation(
    index: number,
    key: 'institution' | 'detail',
    value: string
  ): void {
    setContent((c) => ({
      ...c,
      education: c.education.map((item, position) =>
        position === index ? { ...item, [key]: value } : item
      ),
    }));
  }
}

function ResumePreview({
  content,
  name,
}: {
  content: BuilderContent;
  name: string;
}): React.ReactElement {
  const skills = useMemo(
    () => content.skills.split(',').map((skill) => skill.trim()).filter(Boolean),
    [content.skills]
  );

  return (
    <Card as="article">
      <CardHeader title="Preview" description="Rendered from the same structured content that is saved." />
      <div className="space-y-6 p-6">
        <header>
          <h2 className="text-xl font-semibold text-ink">{name || 'Your name'}</h2>
          {content.headline ? (
            <p className="mt-1 text-sm text-accent-soft">{content.headline}</p>
          ) : null}
        </header>

        {content.summary ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300">
              {content.summary}
            </p>
          </section>
        ) : null}

        {skills.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Skills</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li key={skill}>
                  <Badge tone="bg-accent-tint text-accent-soft ring-accent/40">{skill}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {content.experience.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Experience</h3>
            <ul className="mt-3 space-y-4">
              {content.experience.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  <p className="text-sm font-medium text-ink">{item.title || 'Role'}</p>
                  <p className="text-sm text-slate-400">
                    {item.company}
                    {item.period ? ` ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ${item.period}` : ''}
                  </p>
                  {item.description ? (
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-400">
                      {item.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {content.education.length > 0 ? (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Education</h3>
            <ul className="mt-3 space-y-2">
              {content.education.map((item, index) => (
                <li key={`${item.institution}-${index}`}>
                  <p className="text-sm font-medium text-ink">{item.institution || 'Institution'}</p>
                  {item.detail ? <p className="text-sm text-slate-400">{item.detail}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Reads stored builder content, seeding from the profile when a version has none
 * so a candidate is not staring at an empty form.
 */
function readContent(
  version: ResumeVersion,
  profile: CandidateProfile | undefined,
  details: CandidateDetails | null | undefined,
): BuilderContent {
  const stored = version.contentJson as Partial<BuilderContent> | null;

  const experience = Array.isArray(stored?.experience)
    ? (stored!.experience as BuilderContent['experience'])
    : (details?.experience ?? []).map((item) => ({
        title: item.title,
        company: item.company,
        period: item.isCurrent
          ? `${item.startDate ?? ''} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Present`.trim()
          : `${item.startDate ?? ''} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ ${item.endDate ?? ''}`.trim(),
        description: item.description ?? '',
      }));

  const education = Array.isArray(stored?.education)
    ? (stored!.education as BuilderContent['education'])
    : (details?.education ?? []).map((item) => ({
        institution: item.institution,
        detail: [item.degree, item.fieldOfStudy, item.endYear].filter(Boolean).join(', '),
      }));

  return {
    headline: stored?.headline ?? profile?.headline ?? '',
    summary: stored?.summary ?? profile?.summary ?? '',
    skills:
      stored?.skills ??
      (details?.skills ?? [])
        .map((skill) => skill.displayName || skill.name)
        .join(', '),
    experience,
    education,
  };
}
