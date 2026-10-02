'use client';

import { useState } from 'react';
import { portalDelete, portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { CandidateDetails, DetailsSection } from '@/lib/portal-client/types';
import { titleCase } from '@/lib/portal-client/format';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  inputClass,
} from '@/components/portal/ui';

/**
 * Structured profile sections: skills, languages, education, experience,
 * projects, certifications and achievements.
 *
 * Every add and delete posts to the real endpoint and the list is reloaded from
 * the server afterwards, so what is on screen is always what was persisted. A
 * row is never removed optimistically and then quietly restored.
 *
 * Deletes ask for confirmation because a candidate's work history is not
 * something to lose to a stray click, and the server reports honestly whether a
 * row was actually removed.
 */

interface Drafts {
  skill: { name: string; proficiency: string; yearsOfExperience: string };
  language: { name: string; proficiency: string };
  education: {
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startYear: string;
    endYear: string;
    grade: string;
  };
  experience: {
    company: string;
    title: string;
    employmentType: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
  };
  project: { name: string; description: string; url: string; technologies: string };
  certification: { name: string; issuer: string; issuedOn: string; credentialId: string };
  achievement: { title: string; description: string; achievedOn: string };
}

const EMPTY_DRAFTS: Drafts = {
  skill: { name: '', proficiency: 'intermediate', yearsOfExperience: '' },
  language: { name: '', proficiency: 'professional' },
  education: { institution: '', degree: '', fieldOfStudy: '', startYear: '', endYear: '', grade: '' },
  experience: {
    company: '',
    title: '',
    employmentType: 'full_time',
    location: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
  },
  project: { name: '', description: '', url: '', technologies: '' },
  certification: { name: '', issuer: '', issuedOn: '', credentialId: '' },
  achievement: { title: '', description: '', achievedOn: '' },
};

const PROFICIENCIES = ['beginner', 'intermediate', 'advanced', 'expert', 'professional'];

export function ProfileSections(): React.ReactElement {
  const details = useAsync(() => portalGet<CandidateDetails>('/api/portal/candidate/details'), []);
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [active, setActive] = useState<DetailsSection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function setDraft<K extends keyof Drafts>(section: K, patch: Partial<Drafts[K]>): void {
    setDrafts((current) => ({ ...current, [section]: { ...current[section], ...patch } }));
  }

  async function add(section: DetailsSection): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await portalPost('/api/portal/candidate/details', toPayload(section, drafts));
      // Reload rather than assume: the server decides what was stored.
      await details.reload();
      setDrafts(EMPTY_DRAFTS);
      setActive(null);
      setMessage(`${titleCase(section)} added.`);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove(section: DetailsSection, id: string, label: string): Promise<void> {
    if (!window.confirm(`Remove "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await portalDelete<{ removed: boolean }>('/api/portal/candidate/details', {
        type: section,
        id,
      });
      await details.reload();
      // Report the real outcome rather than assuming the row is gone.
      setMessage(
        result.removed
          ? `${titleCase(section)} removed.`
          : 'That entry was already gone, so nothing changed.'
      );
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (details.loading) return <LoadingState label="Loading your profile sections…" />;
  if (details.error) return <ErrorState message={details.error} onRetry={details.reload} />;
  if (!details.data) return <LoadingState label="Loading your profile sections…" />;
  const data = details.data;

  return (
    <div className="space-y-5">
      {error ? <Alert kind="error">{error}</Alert> : null}
      {message ? <Alert kind="success">{message}</Alert> : null}

      <Section
        title="Skills"
        description="Matched against job postings, so use the names employers search for."
        entries={data.skills.map((skill) => ({
          id: skill.id,
          primary: skill.displayName || skill.name,
          secondary:
            [skill.proficiency, skill.yearsOfExperience ? `${skill.yearsOfExperience} yrs` : null]
              .filter(Boolean)
              .join(' · ') || null,
        }))}
        emptyText="No skills added yet."
        onAdd={() => setActive(active === 'skill' ? null : 'skill')}
        onRemove={(id) => remove('skill', id, 'this skill')}
        busy={busy}
      >
        {active === 'skill' ? (
          <div className="space-y-3 border-t border-line p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Skill" htmlFor="s-name">
                <input
                  id="s-name"
                  className={inputClass}
                  value={drafts.skill.name}
                  onChange={(event) => setDraft('skill', { name: event.target.value })}
                  placeholder="Node.js"
                />
              </Field>
              <Field label="Proficiency" htmlFor="s-level">
                <select
                  id="s-level"
                  className={inputClass}
                  value={drafts.skill.proficiency}
                  onChange={(event) => setDraft('skill', { proficiency: event.target.value })}
                >
                  {PROFICIENCIES.map((level) => (
                    <option key={level} value={level}>
                      {titleCase(level)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Years" htmlFor="s-years">
                <input
                  id="s-years"
                  type="number"
                  min={0}
                  max={70}
                  className={inputClass}
                  value={drafts.skill.yearsOfExperience}
                  onChange={(event) => setDraft('skill', { yearsOfExperience: event.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => add('skill')}
                loading={busy}
                disabled={drafts.skill.name.trim().length === 0}
              >
                Add skill
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Languages"
        entries={data.languages.map((language) => ({
          id: language.id,
          primary: language.displayName || language.name,
          secondary: language.proficiency ? titleCase(language.proficiency) : null,
        }))}
        emptyText="No languages added yet."
        onAdd={() => setActive(active === 'language' ? null : 'language')}
        onRemove={(id) => remove('language', id, 'this language')}
        busy={busy}
      >
        {active === 'language' ? (
          <div className="grid gap-3 border-t border-line p-5 sm:grid-cols-[1fr_auto]">
            <Field label="Language" htmlFor="l-name">
              <input
                id="l-name"
                className={inputClass}
                value={drafts.language.name}
                onChange={(event) => setDraft('language', { name: event.target.value })}
                placeholder="English"
              />
            </Field>
            <Field label="Proficiency" htmlFor="l-level">
              <select
                id="l-level"
                className={inputClass}
                value={drafts.language.proficiency}
                onChange={(event) => setDraft('language', { proficiency: event.target.value })}
              >
                {PROFICIENCIES.map((level) => (
                  <option key={level} value={level}>
                    {titleCase(level)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                onClick={() => add('language')}
                loading={busy}
                disabled={drafts.language.name.trim().length === 0}
              >
                Add language
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Work experience"
        entries={data.experience.map((experience) => ({
          id: experience.id,
          primary: `${experience.title} · ${experience.company}`,
          secondary: [
            experience.location,
            experience.startDate
              ? `${experience.startDate} – ${experience.isCurrent ? 'Present' : experience.endDate ?? ''}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))}
        emptyText="No work experience added yet."
        onAdd={() => setActive(active === 'experience' ? null : 'experience')}
        onRemove={(id) => remove('experience', id, 'this role')}
        busy={busy}
      >
        {active === 'experience' ? (
          <div className="space-y-3 border-t border-line p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job title" htmlFor="e-title">
                <input
                  id="e-title"
                  className={inputClass}
                  value={drafts.experience.title}
                  onChange={(event) => setDraft('experience', { title: event.target.value })}
                />
              </Field>
              <Field label="Company" htmlFor="e-company">
                <input
                  id="e-company"
                  className={inputClass}
                  value={drafts.experience.company}
                  onChange={(event) => setDraft('experience', { company: event.target.value })}
                />
              </Field>
              <Field label="Location" htmlFor="e-location">
                <input
                  id="e-location"
                  className={inputClass}
                  value={drafts.experience.location}
                  onChange={(event) => setDraft('experience', { location: event.target.value })}
                />
              </Field>
              <Field label="Employment type" htmlFor="e-type">
                <select
                  id="e-type"
                  className={inputClass}
                  value={drafts.experience.employmentType}
                  onChange={(event) =>
                    setDraft('experience', { employmentType: event.target.value })
                  }
                >
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="freelance">Freelance</option>
                </select>
              </Field>
              <Field label="Start date" htmlFor="e-start" hint="For example 2023-04">
                <input
                  id="e-start"
                  className={inputClass}
                  value={drafts.experience.startDate}
                  onChange={(event) => setDraft('experience', { startDate: event.target.value })}
                />
              </Field>
              <Field label="End date" htmlFor="e-end">
                <input
                  id="e-end"
                  className={inputClass}
                  value={drafts.experience.endDate}
                  disabled={drafts.experience.isCurrent}
                  onChange={(event) => setDraft('experience', { endDate: event.target.value })}
                />
              </Field>
            </div>
            <Field label="What you did" htmlFor="e-desc">
              <textarea
                id="e-desc"
                rows={3}
                className={inputClass}
                value={drafts.experience.description}
                onChange={(event) => setDraft('experience', { description: event.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={drafts.experience.isCurrent}
                onChange={(event) => setDraft('experience', { isCurrent: event.target.checked })}
                className="h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-slate-300">I currently work here</span>
            </label>
            <div className="flex gap-2">
              <Button
                onClick={() => add('experience')}
                loading={busy}
                disabled={
                  drafts.experience.title.trim().length === 0 ||
                  drafts.experience.company.trim().length === 0
                }
              >
                Add experience
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Education"
        entries={data.education.map((education) => ({
          id: education.id,
          primary: education.institution,
          secondary: [education.degree, education.fieldOfStudy, education.endYear]
            .filter(Boolean)
            .join(' · '),
        }))}
        emptyText="No education added yet."
        onAdd={() => setActive(active === 'education' ? null : 'education')}
        onRemove={(id) => remove('education', id, 'this education entry')}
        busy={busy}
      >
        {active === 'education' ? (
          <div className="space-y-3 border-t border-line p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Institution" htmlFor="ed-inst">
                <input
                  id="ed-inst"
                  className={inputClass}
                  value={drafts.education.institution}
                  onChange={(event) => setDraft('education', { institution: event.target.value })}
                />
              </Field>
              <Field label="Degree" htmlFor="ed-degree">
                <input
                  id="ed-degree"
                  className={inputClass}
                  value={drafts.education.degree}
                  onChange={(event) => setDraft('education', { degree: event.target.value })}
                  placeholder="B.Tech"
                />
              </Field>
              <Field label="Field of study" htmlFor="ed-field">
                <input
                  id="ed-field"
                  className={inputClass}
                  value={drafts.education.fieldOfStudy}
                  onChange={(event) => setDraft('education', { fieldOfStudy: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start year" htmlFor="ed-start">
                  <input
                    id="ed-start"
                    type="number"
                    min={1900}
                    max={2100}
                    className={inputClass}
                    value={drafts.education.startYear}
                    onChange={(event) => setDraft('education', { startYear: event.target.value })}
                  />
                </Field>
                <Field label="End year" htmlFor="ed-end">
                  <input
                    id="ed-end"
                    type="number"
                    min={1900}
                    max={2100}
                    className={inputClass}
                    value={drafts.education.endYear}
                    onChange={(event) => setDraft('education', { endYear: event.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => add('education')}
                loading={busy}
                disabled={drafts.education.institution.trim().length === 0}
              >
                Add education
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Projects"
        entries={data.projects.map((project) => ({
          id: project.id,
          primary: project.name,
          secondary: project.technologies.join(', ') || null,
        }))}
        emptyText="No projects added yet."
        onAdd={() => setActive(active === 'project' ? null : 'project')}
        onRemove={(id) => remove('project', id, 'this project')}
        busy={busy}
      >
        {active === 'project' ? (
          <div className="space-y-3 border-t border-line p-5">
            <Field label="Project name" htmlFor="pr-name">
              <input
                id="pr-name"
                className={inputClass}
                value={drafts.project.name}
                onChange={(event) => setDraft('project', { name: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="pr-desc">
              <textarea
                id="pr-desc"
                rows={3}
                className={inputClass}
                value={drafts.project.description}
                onChange={(event) => setDraft('project', { description: event.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Link" htmlFor="pr-url">
                <input
                  id="pr-url"
                  type="url"
                  className={inputClass}
                  value={drafts.project.url}
                  onChange={(event) => setDraft('project', { url: event.target.value })}
                  placeholder="https://"
                />
              </Field>
              <Field label="Technologies" htmlFor="pr-tech" hint="Comma separated.">
                <input
                  id="pr-tech"
                  className={inputClass}
                  value={drafts.project.technologies}
                  onChange={(event) => setDraft('project', { technologies: event.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => add('project')}
                loading={busy}
                disabled={drafts.project.name.trim().length === 0}
              >
                Add project
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Certifications"
        entries={data.certifications.map((certification) => ({
          id: certification.id,
          primary: certification.name,
          secondary: certification.issuer,
        }))}
        emptyText="No certifications added yet."
        onAdd={() => setActive(active === 'certification' ? null : 'certification')}
        onRemove={(id) => remove('certification', id, 'this certification')}
        busy={busy}
      >
        {active === 'certification' ? (
          <div className="space-y-3 border-t border-line p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Certification" htmlFor="c-name">
                <input
                  id="c-name"
                  className={inputClass}
                  value={drafts.certification.name}
                  onChange={(event) => setDraft('certification', { name: event.target.value })}
                />
              </Field>
              <Field label="Issuer" htmlFor="c-issuer">
                <input
                  id="c-issuer"
                  className={inputClass}
                  value={drafts.certification.issuer}
                  onChange={(event) => setDraft('certification', { issuer: event.target.value })}
                />
              </Field>
              <Field label="Issued on" htmlFor="c-issued" hint="For example 2024-05">
                <input
                  id="c-issued"
                  className={inputClass}
                  value={drafts.certification.issuedOn}
                  onChange={(event) => setDraft('certification', { issuedOn: event.target.value })}
                />
              </Field>
              <Field label="Credential ID" htmlFor="c-cred">
                <input
                  id="c-cred"
                  className={inputClass}
                  value={drafts.certification.credentialId}
                  onChange={(event) => setDraft('certification', { credentialId: event.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => add('certification')}
                loading={busy}
                disabled={drafts.certification.name.trim().length === 0}
              >
                Add certification
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Achievements"
        entries={data.achievements.map((achievement) => ({
          id: achievement.id,
          primary: achievement.title,
          secondary: achievement.description,
        }))}
        emptyText="No achievements added yet."
        onAdd={() => setActive(active === 'achievement' ? null : 'achievement')}
        onRemove={(id) => remove('achievement', id, 'this achievement')}
        busy={busy}
      >
        {active === 'achievement' ? (
          <div className="space-y-3 border-t border-line p-5">
            <Field label="Achievement" htmlFor="a-title">
              <input
                id="a-title"
                className={inputClass}
                value={drafts.achievement.title}
                onChange={(event) => setDraft('achievement', { title: event.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="a-desc">
              <textarea
                id="a-desc"
                rows={2}
                className={inputClass}
                value={drafts.achievement.description}
                onChange={(event) => setDraft('achievement', { description: event.target.value })}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={() => add('achievement')}
                loading={busy}
                disabled={drafts.achievement.title.trim().length === 0}
              >
                Add achievement
              </Button>
              <Button variant="ghost" onClick={() => setActive(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  entries,
  emptyText,
  onAdd,
  onRemove,
  busy,
  children,
}: {
  title: string;
  description?: string;
  entries: Array<{ id: string; primary: string; secondary: string | null }>;
  emptyText: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  busy: boolean;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          <Button variant="secondary" size="sm" onClick={onAdd}>
            Add
          </Button>
        }
      />
      <div className="p-5">
        {entries.length === 0 ? (
          <EmptyState title={emptyText} />
        ) : (
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{entry.primary}</p>
                  {entry.secondary ? (
                    <p className="truncate text-xs text-slate-500">{entry.secondary}</p>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => onRemove(entry.id)} disabled={busy}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {children}
    </Card>
  );
}

/** Converts a draft into the discriminated payload the endpoint expects. */
function toPayload(section: DetailsSection, drafts: Drafts): Record<string, unknown> {
  switch (section) {
    case 'skill':
      return {
        type: 'skill',
        name: drafts.skill.name.trim(),
        proficiency: drafts.skill.proficiency,
        yearsOfExperience: drafts.skill.yearsOfExperience
          ? Number(drafts.skill.yearsOfExperience)
          : null,
      };
    case 'language':
      return {
        type: 'language',
        name: drafts.language.name.trim(),
        proficiency: drafts.language.proficiency,
      };
    case 'education':
      return {
        type: 'education',
        institution: drafts.education.institution.trim(),
        degree: drafts.education.degree.trim() || null,
        fieldOfStudy: drafts.education.fieldOfStudy.trim() || null,
        startYear: drafts.education.startYear ? Number(drafts.education.startYear) : null,
        endYear: drafts.education.endYear ? Number(drafts.education.endYear) : null,
        grade: drafts.education.grade.trim() || null,
      };
    case 'experience':
      return {
        type: 'experience',
        company: drafts.experience.company.trim(),
        title: drafts.experience.title.trim(),
        employmentType: drafts.experience.employmentType,
        location: drafts.experience.location.trim() || null,
        startDate: drafts.experience.startDate.trim() || null,
        endDate: drafts.experience.endDate.trim() || null,
        isCurrent: drafts.experience.isCurrent,
        description: drafts.experience.description.trim() || null,
      };
    case 'project':
      return {
        type: 'project',
        name: drafts.project.name.trim(),
        description: drafts.project.description.trim() || null,
        url: drafts.project.url.trim() || null,
        technologies: drafts.project.technologies
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      };
    case 'certification':
      return {
        type: 'certification',
        name: drafts.certification.name.trim(),
        issuer: drafts.certification.issuer.trim() || null,
        issuedOn: drafts.certification.issuedOn.trim() || null,
        credentialId: drafts.certification.credentialId.trim() || null,
      };
    case 'achievement':
      return {
        type: 'achievement',
        title: drafts.achievement.title.trim(),
        description: drafts.achievement.description.trim() || null,
        achievedOn: drafts.achievement.achievedOn.trim() || null,
      };
    default:
      return {};
  }
}
