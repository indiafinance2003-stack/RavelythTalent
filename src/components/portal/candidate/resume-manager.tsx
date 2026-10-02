'use client';

import Link from 'next/link';
import { useState } from 'react';
import { portalDelete, portalDownload, portalSend, portalUpload } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { ResumeSummary, ResumeTemplate, ResumeVersion } from '@/lib/portal-client/types';
import { formatDate, formatRelative } from '@/lib/portal-client/format';
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
 * Resume management: containers, versions, uploads and downloads.
 *
 * Uploads go as multipart/form-data with a `file` part, which the backend checks
 * three ways: extension allowlist, declared MIME type, and the real byte
 * signature. A renamed executable is rejected server-side, and this UI surfaces
 * that refusal rather than reporting a successful upload.
 *
 * Downloads go through the authorised endpoint, which records an access-log row.
 * A denied read returns 404, so the message shown is deliberately vague.
 *
 * Uploading requires `resume_storage` consent; if it has been withdrawn the
 * server refuses and this shows exactly why.
 */
export function ResumeManager(): React.ReactElement {
  const resumes = useAsync(
    () => portalGet<{ resumes: ResumeSummary[]; templates: ResumeTemplate[] }>(
      '/api/portal/candidate/resumes'
    ),
    []
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function createResume(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (label.trim().length === 0) {
      setError('Give the resume a label, for example "Backend Engineer".');
      return;
    }
    setCreating(true);
    try {
      await portalSend('POST', '/api/portal/candidate/resumes', {
        label: label.trim(),
        templateCode: templateCode.trim() || null,
        makeDefault,
      });
      setLabel('');
      setTemplateCode('');
      setMakeDefault(false);
      await resumes.reload();
      setMessage('Resume created. Upload a file or build one in the Resume Builder.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setCreating(false);
    }
  }

  const activeResume = (resumes.data?.resumes ?? []).find((resume) => resume.id === selected) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resumes"
        title="Your resumes"
        description="Keep several resumes so you can send the right one to each role. Employers only ever see a resume you have applied with."
      />

      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Card>
        <CardHeader title="Create a resume" description="A resume holds one or more versions." />
        <form onSubmit={createResume} noValidate className="grid gap-4 p-5 sm:grid-cols-[2fr_1fr_auto]">
          <Field label="Label" htmlFor="r-label">
            <input
              id="r-label"
              className={inputClass}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
                setMessage(null);
              }}
              placeholder="Backend Engineer"
            />
          </Field>
          <Field label="Template" htmlFor="r-template">
            <select
              id="r-template"
              className={inputClass}
              value={templateCode}
              onChange={(event) => setTemplateCode(event.target.value)}
            >
              <option value="">No template</option>
              {(resumes.data?.templates ?? []).map((template) => (
                <option key={template.code} value={template.code}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={creating} className="w-full sm:w-auto">
              Create
            </Button>
          </div>
          <label className="flex items-center gap-2 sm:col-span-3">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
              className="h-4 w-4 accent-[#2563eb]"
            />
            <span className="text-sm text-slate-300">Make this my default resume</span>
          </label>
        </form>
      </Card>

      {resumes.loading ? <LoadingState label="Loading your resumes…" /> : null}
      {resumes.error ? <ErrorState message={resumes.error} onRetry={resumes.reload} /> : null}

      {resumes.data && resumes.data.resumes.length === 0 ? (
        <EmptyState
          title="You have not created a resume yet"
          description="Create one above, then upload a PDF or DOCX, or build one in the Resume Builder."
        />
      ) : null}

      {resumes.data && resumes.data.resumes.length > 0 ? (
        <ul className="space-y-3">
          {resumes.data.resumes.map((resume) => (
            <ResumeRow
              key={resume.id}
              resume={resume}
              expanded={selected === resume.id}
              onToggle={() => setSelected(selected === resume.id ? null : resume.id)}
              onChanged={resumes.reload}
            />
          ))}
        </ul>
      ) : null}

      {activeResume ? (
        <ResumeBuilderEntry resumeId={activeResume.id} label={activeResume.label} />
      ) : null}
    </div>
  );
}

function ResumeRow({
  resume,
  expanded,
  onToggle,
  onChanged,
}: {
  resume: ResumeSummary;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}): React.ReactElement {
  const versions = useAsync(
    () => (expanded ? portalGet<{ versions: ResumeVersion[] }>(`/api/portal/candidate/resumes/${resume.id}/versions`) : Promise.resolve({ versions: [] })),
    [expanded, resume.id]
  );

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Reset immediately so re-selecting the same file fires another change.
    event.target.value = '';
    if (!file) return;

    setError(null);
    setMessage(null);
    setUploading(true);
    try {
      await portalUpload(`/api/portal/candidate/resumes/${resume.id}/versions`, file);
      await versions.reload();
      await onChanged();
      setMessage(`"${file.name}" was uploaded as a new version.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setUploading(false);
    }
  }

  async function makeDefault(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await portalSend('PATCH', '/api/portal/candidate/resumes', {
        resumeId: resume.id,
        isDefault: true,
      });
      await onChanged();
      setMessage('Default resume updated.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete "${resume.label}" and every version of it? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await portalDelete<{ removed: boolean }>('/api/portal/candidate/resumes', {
        resumeId: resume.id,
      });
      await onChanged();
      setMessage(result.removed ? 'Resume deleted.' : 'That resume was already gone.');
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function download(version: ResumeVersion): Promise<void> {
    setError(null);
    try {
      await portalDownload(
        `/api/portal/candidate/resumes/versions/${version.id}`,
        version.originalFilename
      );
    } catch (caught) {
      setError(formatApiError(caught));
    }
  }

  return (
    <li>
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {resume.label}
              {resume.isDefault ? (
                <Badge tone="bg-emerald-500/10 text-emerald-300 ring-emerald-500/40">Default</Badge>
              ) : null}
              {resume.templateCode ? <Badge>{resume.templateCode}</Badge> : null}
            </span>
          }
          description={
            resume.latestVersion
              ? `Version ${resume.latestVersion} · uploaded ${formatRelative(resume.latestUploadedAt)}`
              : 'No versions uploaded yet'
          }
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onToggle}>
                {expanded ? 'Hide' : 'Manage'}
              </Button>
            </div>
          }
        />

        {expanded ? (
          <div className="space-y-4 p-5">
            {error ? <Alert kind="error">{error}</Alert> : null}
            {message ? <Alert kind="success">{message}</Alert> : null}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor={`upload-${resume.id}`} className="mb-1 block text-sm font-medium text-slate-300">
                  Upload a new version
                </label>
                <input
                  id={`upload-${resume.id}`}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  disabled={uploading}
                  onChange={upload}
                  className="block w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-sm file:text-white"
                />
              </div>
              {!resume.isDefault ? (
                <Button variant="secondary" onClick={makeDefault} loading={busy}>
                  Make default
                </Button>
              ) : null}
              <Button variant="danger" onClick={remove} loading={busy}>
                Delete
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Accepted formats: PDF, DOC and DOCX. The file is checked by extension, declared type and
              its actual contents before it is stored.
            </p>

            {versions.loading ? <LoadingState label="Loading versions…" /> : null}
            {versions.error ? <ErrorState message={versions.error} onRetry={versions.reload} /> : null}

            {versions.data && versions.data.versions.length > 0 ? (
              <ul className="divide-y divide-line">
                {versions.data.versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        Version {version.versionNumber} — {version.originalFilename}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDate(version.createdAt)} · {Math.max(1, Math.round(version.byteSize / 1024))} KB
                        {version.contentJson ? ' · has builder content' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" size="sm" onClick={() => download(version)}>
                        Download
                      </Button>
                      {version.contentJson ? (
                        <Link
                          href={`/candidate/resumes/builder?versionId=${version.id}`}
                          className="inline-flex items-center rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-accent hover:text-accent"
                        >
                          Edit in builder
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {versions.data && versions.data.versions.length === 0 ? (
              <EmptyState
                title="No versions yet"
                description="Upload a file above, or create one in the Resume Builder."
                action={
                  <Link
                    href={`/candidate/resumes/builder?resumeId=${resume.id}`}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
                  >
                    Open the Resume Builder
                  </Link>
                }
              />
            ) : null}
          </div>
        ) : null}
      </Card>
    </li>
  );
}

function ResumeBuilderEntry({
  resumeId,
  label,
}: {
  resumeId: string;
  label: string;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title="Build a resume"
        description="Create a structured resume in the builder and save it as a new version of this resume."
      />
      <div className="p-5">
        <Link
          href={`/candidate/resumes/builder?resumeId=${resumeId}`}
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Open the Resume Builder for “{label}”
        </Link>
      </div>
    </Card>
  );
}
