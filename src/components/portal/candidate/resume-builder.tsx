'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { portalGet, portalPost, portalSend, portalDownload } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import type { ResumeSummary } from '@/lib/portal-client/types';
import type { ResumeDocument } from '@/lib/resume/content';
import {
  DEFAULT_RESUME_TEMPLATE,
  isResumeTemplateCode,
  RESUME_TEMPLATE_LAYOUTS,
  type ResumeTemplateCode,
} from '@/lib/resume/template-layouts';
import {
  resolveBuilderCapabilities,
  type BuilderCapabilities,
} from '@/lib/portal/premium/entitlement-codes';
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
  Meter,
  PageHeader,
  inputClass,
} from '@/components/portal/ui';
import { DocumentEditor } from './resume-builder/document-editor';
import { ResumePreview } from './resume-builder/live-preview';
import { TemplatePicker } from './resume-builder/template-picker';

/**
 * Resume Builder.
 *
 * THE MODEL HAS CHANGED, AND THIS COMPONENT IS THE REASON IT WORKS
 * ---------------------------------------------------------------
 * The builder used to attach a flat, ad-hoc shape (`headline`, a comma-joined
 * `skills` string, `experience[].period`) to an already-uploaded file version, and
 * had no way to produce a document of its own. Nothing rendered that shape, so
 * saving it changed nothing about any PDF.
 *
 * It now edits the same `ResumeDocument` the server validates and the PDF renderer
 * prints, against a working copy on the resume (`builderContentJson`). Versions
 * are immutable snapshots created deliberately, and each one can be rendered to a
 * real, privately stored PDF.
 *
 * WHAT IS *NOT* DECIDED HERE
 * --------------------------
 * Every paid capability. The buttons below are disabled based on entitlements so
 * the UI is honest about what the account can do, but each one is enforced again
 * server-side — this component cannot grant anything, and a modified client gets
 * a 403 from the service rather than a feature.
 */

interface BuilderVersionDTO {
  id: string;
  versionNumber: number;
  source: string;
  label: string | null;
  isDefault: boolean;
  hasPdf: boolean;
  pdfByteSize: number | null;
  hasContent: boolean;
  hasUpload: boolean;
  createdAt: string;
}

interface BuilderDraftDTO {
  resumeId: string;
  label: string;
  templateCode: string | null;
  document: ResumeDocument;
  completion: number;
  sections: string[];
  updatedAt: string;
}

interface ExportResult {
  pdf: {
    versionId: string;
    templateCode: string | null;
    byteSize: number;
    checksumSha256: string;
    renderedSections: string[];
    generatedAt: string;
  };
}

/** The capabilities of an account with nothing granted, used before any load. */
const NO_CAPABILITIES: BuilderCapabilities = {
  canBuild: false,
  canUseProfessionalTemplates: false,
  canKeepMultipleVersions: false,
  canExportPdf: false,
  canViewVersionHistory: false,
  hasAnyRestriction: true,
};

function emptyDocument(fullName: string): ResumeDocument {
  return {
    schemaVersion: 1,
    basics: { fullName },
    contact: { email: '' },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    sectionOrder: ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'languages'],
  };
}

export function ResumeBuilder(): React.ReactElement {
  const searchParams = useSearchParams();
  const requestedResumeId = searchParams.get('resumeId');

  const resumes = useAsync(
    () => portalGet<{ resumes: ResumeSummary[] }>('/api/portal/candidate/resumes'),
    []
  );

  // Capabilities come from the server's own entitlement list, so the UI cannot
  // disagree with the service about what this account may do.
  const premium = useAsync(
    () =>
      portalGet<{ entitlements: Array<{ code: string }> }>(
        '/api/portal/candidate/premium'
      ),
    []
  );

  const [resumeId, setResumeId] = useState<string | null>(requestedResumeId);
  const [document, setDocument] = useState<ResumeDocument | null>(null);
  const [templateCode, setTemplateCode] = useState<ResumeTemplateCode>(DEFAULT_RESUME_TEMPLATE);
  const [busy, setBusy] = useState<'save' | 'version' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [versions, setVersions] = useState<BuilderVersionDTO[]>([]);

  const capabilities = useMemo<BuilderCapabilities>(() => {
    if (!premium.data) return NO_CAPABILITIES;
    return resolveBuilderCapabilities(premium.data.entitlements.map((row) => row.code));
  }, [premium.data]);

  // Default to the first resume once the list arrives, so the page is usable
  // without a resumeId in the URL.
  useEffect(() => {
    if (resumeId) return;
    const first = resumes.data?.resumes[0];
    if (first) setResumeId(first.id);
  }, [resumes.data, resumeId]);

  const draft = useAsync(
    () =>
      resumeId
        ? portalGet<{ draft: BuilderDraftDTO }>(
            `/api/portal/candidate/resumes/${resumeId}/builder`
          )
        : Promise.resolve(null),
    [resumeId]
  );

  // Adopt the stored working copy when the selected resume changes, but never
  // while the candidate is mid-edit: overwriting unsaved edits because a
  // background refetch landed would be worse than a stale form.
  useEffect(() => {
    if (!draft.data?.draft) {
      setDocument(null);
      return;
    }
    setDocument(draft.data.draft.document);
    setTemplateCode(
      draft.data.draft.templateCode && isResumeTemplateCode(draft.data.draft.templateCode)
        ? draft.data.draft.templateCode
        : DEFAULT_RESUME_TEMPLATE
    );
  }, [draft.data]);

  const loadVersions = useCallback(async (): Promise<void> => {
    if (!resumeId || !capabilities.canViewVersionHistory) {
      setVersions([]);
      return;
    }
    try {
      const response = await portalGet<{ versions: BuilderVersionDTO[] }>(
        `/api/portal/candidate/resumes/${resumeId}/history`
      );
      setVersions(response.versions);
      setHistoryError(null);
    } catch (caught) {
      // A history that will not load must not take the editor down with it.
      setVersions([]);
      setHistoryError(formatApiError(caught));
    }
  }, [resumeId, capabilities.canViewVersionHistory]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  if (resumes.loading || premium.loading || draft.loading) {
    return <LoadingState label="Loading the Resume Builder…" />;
  }
  if (resumes.error) return <ErrorState message={resumes.error} onRetry={resumes.reload} />;
  if (draft.error) return <ErrorState message={draft.error} onRetry={draft.reload} />;

  const resumeList = resumes.data?.resumes ?? [];

  if (resumeList.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Resume Builder" title="Build a resume" />
        <EmptyState
          title="Create a resume to start building"
          description="A builder document belongs to a resume, so create the resume first. You can still upload a file for any resume from your resumes page."
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

  const currentDraft = draft.data?.draft ?? null;
  const template = RESUME_TEMPLATE_LAYOUTS[templateCode];
  const templateLocked = template.isPremium && !capabilities.canUseProfessionalTemplates;
  const canExport =
    capabilities.canExportPdf && !templateLocked && (versions.length > 0 || document !== null);
  const editable = capabilities.canBuild;

  async function save(): Promise<void> {
    if (!resumeId || !document) return;
    setBusy('save');
    setError(null);
    setMessage(null);
    try {
      const response = await portalSend<{ draft: BuilderDraftDTO }>(
        'PUT',
        `/api/portal/candidate/resumes/${resumeId}/builder`,
        { document, templateCode }
      );
      setDocument(response.draft.document);
      setMessage('Saved. Your working copy is up to date.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveVersion(): Promise<void> {
    if (!resumeId) return;
    setBusy('version');
    setError(null);
    setMessage(null);
    try {
      // Saving a version snapshots the STORED working copy, so an unsaved edit is
      // never captured by accident.
      await portalPost<{ version: BuilderVersionDTO }>(
        '/api/portal/candidate/resumes/versions',
        { resumeId }
      );
      await draft.reload();
      await loadVersions();
      setMessage('Saved a new version. You can now export it as a PDF.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf(versionId: string): Promise<void> {
    setBusy('export');
    setError(null);
    setMessage(null);
    try {
      const response = await portalPost<ExportResult>(
        `/api/portal/candidate/resumes/versions/${versionId}/pdf`,
        {}
      );
      await loadVersions();
      setMessage(
        `PDF generated from ${response.pdf.renderedSections.length} section${
          response.pdf.renderedSections.length === 1 ? '' : 's'
        } (${Math.max(1, Math.round(response.pdf.byteSize / 1024))} KB).`
      );
      await downloadGenerated(versionId);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function downloadGenerated(versionId: string): Promise<void> {
    try {
      await portalDownload(
        `/api/portal/candidate/resumes/versions/${versionId}/pdf`,
        'resume.pdf'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    }
  }

  async function restore(versionId: string): Promise<void> {
    setBusy('version');
    setError(null);
    setMessage(null);
    try {
      await portalPost<{ draft: BuilderDraftDTO }>(
        `/api/portal/candidate/resumes/versions/${versionId}/restore`,
        {}
      );
      await draft.reload();
      setMessage('Restored into your working copy. Save to keep it as a new version.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resume Builder"
        title="Build a resume"
        description="Compose structured content, save versions, and export a formatted PDF."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPreview((value) => !value)}>
              {preview ? 'Back to editing' : 'Preview'}
            </Button>
            <Button variant="secondary" onClick={saveVersion} loading={busy === 'version'}>
              Save version
            </Button>
            <Button onClick={save} loading={busy === 'save'} disabled={!editable || !document}>
              Save
            </Button>
          </div>
        }
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      {!capabilities.canBuild ? (
        <Alert kind="warning">
          The Resume Builder is part of Candidate Premium, so saving structured content is locked on
          your plan. You can still upload a document to any resume and apply with it.{' '}
          <Link href="/candidate/premium" className="underline">
            See plans
          </Link>
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="Which resume are you building?" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Resume" htmlFor="builder-resume">
            <select
              id="builder-resume"
              className={inputClass}
              value={resumeId ?? ''}
              onChange={(event) => {
                setResumeId(event.target.value);
                setMessage(null);
                setError(null);
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
          {currentDraft ? (
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-300">Completeness</span>
              <Meter
                value={currentDraft.completion}
                max={100}
                label="Resume completeness"
              />
              <p className="mt-1 text-xs text-slate-500">
                {currentDraft.sections.length} section
                {currentDraft.sections.length === 1 ? '' : 's'} with content
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <TemplatePicker
        selected={templateCode}
        onSelect={setTemplateCode}
        canUsePremium={capabilities.canUseProfessionalTemplates}
        disabled={!editable}
      />

      {preview ? (
        <Card>
          <CardHeader
            title={`Preview — ${template.name}`}
            description="Laid out exactly like the PDF: the same sidebar, header band and accent colour."
          />
          <div className="p-5">
            <ResumePreview
              document={document ?? emptyDocument(currentDraft?.label ?? '')}
              templateCode={templateCode}
            />
          </div>
        </Card>
      ) : (
        <DocumentEditor
          document={document ?? emptyDocument(currentDraft?.label ?? '')}
          onChange={setDocument}
          disabled={!editable}
        />
      )}

      {/* ------------------------------------------------------------ versions */}
      <Card>
        <CardHeader
          title="Versions"
          description="Each saved version is an immutable snapshot you can export, apply with, or restore."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={saveVersion}
              loading={busy === 'version'}
              title={
                capabilities.canKeepMultipleVersions
                  ? undefined
                  : 'Keeping more than one version needs a premium plan'
              }
            >
              Save current as a version
            </Button>
          }
        />
        <div className="space-y-3 p-5">
          {!capabilities.canViewVersionHistory ? (
            <p className="text-sm text-slate-500">
              Version history is part of Candidate Premium.{' '}
              <Link href="/candidate/premium" className="underline">
                See plans
              </Link>
            </p>
          ) : historyError ? (
            <Alert kind="error">{historyError}</Alert>
          ) : versions.length === 0 ? (
            <EmptyState
              title="No versions yet"
              description="Save your content, then save a version to generate an exportable snapshot."
            />
          ) : (
            <ul className="space-y-2">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-ink">
                      <span className="font-medium">
                        {version.label ?? `Version ${version.versionNumber}`}
                      </span>
                      <Badge tone="bg-slate-800 text-slate-300">
                        {version.source === 'builder' ? 'Builder' : 'Upload'}
                      </Badge>
                      {version.hasPdf ? (
                        <Badge tone="bg-emerald-500/15 text-emerald-300">PDF ready</Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      v{version.versionNumber} · saved {new Date(version.createdAt).toLocaleDateString()}
                      {version.pdfByteSize ? ` · ${Math.round(version.pdfByteSize / 1024)} KB` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {version.hasPdf ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void downloadGenerated(version.id)}
                        disabled={busy !== null}
                      >
                        Download PDF
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        loading={busy === 'export'}
                        disabled={!capabilities.canExportPdf || !version.hasContent || templateLocked}
                        title={
                          !capabilities.canExportPdf
                            ? 'PDF export is part of Candidate Premium'
                            : !version.hasContent
                              ? 'This version has no structured content to render'
                              : templateLocked
                                ? 'Switch to a free template, or upgrade to export this layout'
                                : undefined
                        }
                        onClick={() => void exportPdf(version.id)}
                      >
                        Generate PDF
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!version.hasContent || busy !== null}
                      onClick={() => void restore(version.id)}
                    >
                      Restore
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canExport ? null : capabilities.canExportPdf ? null : (
            <p className="text-xs text-slate-500">
              Generating and downloading a PDF is part of Candidate Premium.{' '}
              <Link href="/candidate/premium" className="underline">
                See plans
              </Link>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
