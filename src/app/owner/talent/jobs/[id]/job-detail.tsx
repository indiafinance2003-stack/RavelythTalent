'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

interface JobDetail {
  id: string;
  jobId: string;
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  employmentType: string;
  employmentTypeLabel: string;
  location: string | null;
  workMode: string;
  workModeLabel: string;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMinMinor: number | null;
  salaryMaxMinor: number | null;
  salaryCurrency: string;
  salaryPublic: boolean;
  openings: number;
  requiredSkills: string[];
  preferredSkills: string[];
  qualification: string | null;
  shift: string | null;
  noticePeriodRequirement: string | null;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

interface JobApplicationSummary {
  id: string;
  applicationId: string;
  candidateCode: string;
  status: string;
  createdAt: string;
}

const statusClasses: Record<string, string> = {
  DRAFT: 'bg-slate-800 text-slate-300',
  OPEN: 'bg-emerald-500/100/15 text-emerald-300',
  PAUSED: 'bg-amber-500/100/15 text-amber-300',
  CLOSED: 'bg-red-500/100/15 text-red-300',
  FILLED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-500/100/15 text-red-300',
};

/** Only transitions the recruiting team realistically performs day to day. */
const TRANSITIONS: Record<string, Array<{ status: string; label: string; tone: string }>> = {
  DRAFT: [
    { status: 'OPEN', label: 'Publish', tone: 'bg-emerald-600 hover:bg-emerald-700' },
    { status: 'CANCELLED', label: 'Cancel', tone: 'bg-slate-600 hover:bg-slate-700' },
  ],
  OPEN: [
    { status: 'PAUSED', label: 'Pause', tone: 'bg-amber-600 hover:bg-amber-700' },
    { status: 'FILLED', label: 'Mark filled', tone: 'bg-blue-600 hover:bg-blue-700' },
    { status: 'CLOSED', label: 'Close', tone: 'bg-red-600 hover:bg-red-700' },
  ],
  PAUSED: [
    { status: 'OPEN', label: 'Reopen', tone: 'bg-emerald-600 hover:bg-emerald-700' },
    { status: 'CLOSED', label: 'Close', tone: 'bg-red-600 hover:bg-red-700' },
  ],
  CLOSED: [{ status: 'OPEN', label: 'Reopen', tone: 'bg-emerald-600 hover:bg-emerald-700' }],
  FILLED: [{ status: 'OPEN', label: 'Reopen', tone: 'bg-emerald-600 hover:bg-emerald-700' }],
  CANCELLED: [{ status: 'OPEN', label: 'Reopen', tone: 'bg-emerald-600 hover:bg-emerald-700' }],
};

const chip = 'rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300';
const dt = 'text-xs font-medium uppercase tracking-wide text-slate-400';
const dd = 'mt-1 text-sm text-ink';

function money(minor: number | null, currency: string): string {
  if (minor === null) return 'not disclosed';
  return currency + ' ' + Math.round(minor / 100).toLocaleString('en-IN') + ' per year';
}

interface JobDetailProps {
  jobId: string;
}

export function TalentJobDetailClient({ jobId }: JobDetailProps) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [applications, setApplications] = useState<JobApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobRes, appRes] = await Promise.all([
        fetch('/api/owner/talent/jobs/' + jobId),
        fetch('/api/owner/talent/applications?jobId=' + jobId + '&limit=200'),
      ]);
      const jobJson = await jobRes.json();
      if (!jobRes.ok || !jobJson.success) {
        setError(jobJson?.error?.message ?? 'Failed to load job');
        return;
      }
      setJob(jobJson.data.job);
      const appJson = await appRes.json();
      if (appRes.ok && appJson.success) {
        setApplications(appJson.data.applications ?? []);
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: string): Promise<void> {
    setPending(status);
    try {
      const res = await fetch('/api/owner/talent/jobs/' + jobId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json?.error?.message ?? 'Could not update the job status');
        return;
      }
      setJob(json.data.job);
      setError(null);
    } catch {
      setError('Network error');
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-line bg-navy-surface p-6">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Loading job...
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-500/10 p-4 text-sm text-red-300">
        {error ?? 'Job not found.'}
      </div>
    );
  }

  const experience =
    job.experienceMin != null && job.experienceMax != null
      ? job.experienceMin + ' - ' + job.experienceMax + ' years'
      : job.experienceMin != null
        ? job.experienceMin + '+ years'
        : job.experienceMax != null
          ? 'Up to ' + job.experienceMax + ' years'
          : 'Not specified';

  const salary =
    job.salaryMinMinor != null || job.salaryMaxMinor != null
      ? [job.salaryMinMinor, job.salaryMaxMinor].filter((v): v is number => v !== null).map((v) => money(v, job.salaryCurrency)).join(' to ')
      : 'Not disclosed';

  const transitions = TRANSITIONS[job.status] ?? [];

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-md border border-red-200 bg-red-500/10 p-3 text-sm text-red-300">{error}</div> : null}

      <div className="rounded-xl border border-line bg-navy-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-ink">{job.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{job.jobId}</p>
          </div>
          <span className={'rounded-full px-2.5 py-0.5 text-xs font-medium ' + (statusClasses[job.status] ?? 'bg-slate-800 text-slate-300')}>
            {job.statusLabel}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className={dt}>Client</dt><dd className={dd}>{job.clientName ?? 'Not assigned'}</dd></div>
          <div><dt className={dt}>Location</dt><dd className={dd}>{job.location ?? 'Not specified'}</dd></div>
          <div><dt className={dt}>Work mode</dt><dd className={dd}>{job.workModeLabel}</dd></div>
          <div><dt className={dt}>Employment type</dt><dd className={dd}>{job.employmentTypeLabel}</dd></div>
          <div><dt className={dt}>Experience</dt><dd className={dd}>{experience}</dd></div>
          <div><dt className={dt}>Salary</dt><dd className={dd}>{salary}{job.salaryPublic ? ' (shown publicly)' : ' (internal only)'}</dd></div>
          <div><dt className={dt}>Openings</dt><dd className={dd}>{job.openings}</dd></div>
          <div><dt className={dt}>Shift</dt><dd className={dd}>{job.shift ?? 'Not specified'}</dd></div>
          <div><dt className={dt}>Notice period</dt><dd className={dd}>{job.noticePeriodRequirement ?? 'Not specified'}</dd></div>
          <div><dt className={dt}>Qualification</dt><dd className={dd}>{job.qualification ?? 'Not specified'}</dd></div>
        </dl>

        {job.requiredSkills.length > 0 ? (
          <div className="mt-6">
            <h3 className={dt}>Required skills</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.requiredSkills.map((skill) => (<span key={skill} className={chip}>{skill}</span>))}
            </div>
          </div>
        ) : null}

        {job.preferredSkills.length > 0 ? (
          <div className="mt-6">
            <h3 className={dt}>Preferred skills</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {job.preferredSkills.map((skill) => (<span key={skill} className={chip}>{skill}</span>))}
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className={dt}>Description</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-400">{job.description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-navy-surface p-6">
        <h2 className="text-base font-semibold text-ink">Pipeline actions</h2>
        <p className="mt-1 text-xs text-slate-400">
          This record is managed in the agency console. Every transition is re-validated on the server.
        </p>
        {transitions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No transitions available for this status.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {transitions.map((t) => (
              <button
                key={t.status}
                type="button"
                onClick={() => void changeStatus(t.status)}
                disabled={pending !== null}
                className={'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ' + t.tone}
              >
                {pending === t.status ? 'Working...' : t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-line bg-navy-surface p-6">
        <h2 className="text-base font-semibold text-ink">Applications ({applications.length})</h2>
        {applications.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No applications have been received for this job yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {applications.map((app) => (
              <li key={app.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Link href={'/owner/talent/applications/' + app.id} className="text-sm font-medium text-accent hover:underline">
                  {app.applicationId}
                </Link>
                <span className="text-xs text-slate-400">Candidate {app.candidateCode}</span>
                <span className={chip}>{app.status}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {new Date(app.createdAt).toLocaleDateString('en-IN')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
