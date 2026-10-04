'use client';

import type {
  ResumeCertification,
  ResumeDocument,
  ResumeEducation,
  ResumeExperience,
  ResumeLanguageEntry,
  ResumeProject,
  ResumeSkill,
} from '@/lib/resume/content';
import { Button, Card, CardHeader, Field, inputClass } from '@/components/portal/ui';

/**
 * The structured resume editor.
 *
 * It edits the SAME `ResumeDocument` shape the server validates and the PDF
 * renderer prints. The previous builder had its own flat shape (a single `skills`
 * string, `experience[].title`/`company`/`period`) which no renderer ever read —
 * that is why this replaces it rather than being extended: an editor that writes
 * content the export ignores is worse than no editor, because the candidate sees
 * their work saved and then receives a PDF that does not contain it.
 *
 * Validation is the SERVER's job. Zod is not pulled into the browser bundle to
 * duplicate rules that already exist on the other side; instead the 400's
 * per-field messages are surfaced verbatim by the shell. The only client-side
 * requirement is `basics.fullName`, which the server also enforces.
 */

type ListKey = 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'languages';

function updateAt<T>(list: readonly T[], index: number, next: T): T[] {
  return list.map((item, position) => (position === index ? next : item));
}

function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

/** A comma-separated input bound to a `string[]` field. */
function ListField({
  label,
  htmlFor,
  hint,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  values: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled: boolean;
}): React.ReactElement {
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint}>
      <input
        id={htmlFor}
        className={inputClass}
        disabled={disabled}
        value={values.join(', ')}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          )
        }
      />
    </Field>
  );
}

/** A `number | undefined` field that treats blank input as "not set". */
function NumberField({
  label,
  htmlFor,
  value,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  htmlFor: string;
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  hint?: string;
  disabled: boolean;
}): React.ReactElement {
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint}>
      <input
        id={htmlFor}
        className={inputClass}
        type="number"
        disabled={disabled}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    </Field>
  );
}

function Row({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex items-center justify-between">
        <legend className="px-1 text-xs font-medium text-slate-400">{title}</legend>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {children}
    </fieldset>
  );
}

export function DocumentEditor({
  document,
  onChange,
  disabled,
}: {
  document: ResumeDocument;
  onChange: (next: ResumeDocument) => void;
  disabled: boolean;
}): React.ReactElement {
  const set = <K extends keyof ResumeDocument>(key: K, value: ResumeDocument[K]): void =>
    onChange({ ...document, [key]: value });

  const setContact = (key: keyof ResumeDocument['contact'], value: string): void =>
    onChange({ ...document, contact: { ...document.contact, [key]: value } });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Basics" description="Your name is the one required field." />
        <div className="space-y-4 p-5">
          <Field label="Full name" htmlFor="rb-full-name">
            <input
              id="rb-full-name"
              className={inputClass}
              disabled={disabled}
              value={document.basics.fullName}
              onChange={(event) =>
                onChange({
                  ...document,
                  basics: { ...document.basics, fullName: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Headline" htmlFor="rb-headline" hint="One line: what you do.">
            <input
              id="rb-headline"
              className={inputClass}
              disabled={disabled}
              value={document.basics.headline ?? ''}
              onChange={(event) =>
                onChange({
                  ...document,
                  basics: { ...document.basics, headline: event.target.value },
                })
              }
            />
          </Field>
          <Field label="Summary" htmlFor="rb-summary" hint="Two or three focused sentences.">
            <textarea
              id="rb-summary"
              rows={4}
              className={inputClass}
              disabled={disabled}
              value={document.basics.summary ?? ''}
              onChange={(event) =>
                onChange({
                  ...document,
                  basics: { ...document.basics, summary: event.target.value },
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Contact" description="Only filled fields are printed." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Email" htmlFor="rb-email">
            <input
              id="rb-email"
              className={inputClass}
              disabled={disabled}
              value={document.contact.email}
              onChange={(event) => setContact('email', event.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="rb-phone">
            <input
              id="rb-phone"
              className={inputClass}
              disabled={disabled}
              value={document.contact.phone ?? ''}
              onChange={(event) => setContact('phone', event.target.value)}
            />
          </Field>
          <Field label="Location" htmlFor="rb-location">
            <input
              id="rb-location"
              className={inputClass}
              disabled={disabled}
              value={document.contact.location ?? ''}
              onChange={(event) => setContact('location', event.target.value)}
            />
          </Field>
          <Field label="LinkedIn" htmlFor="rb-linkedin" hint="https://…">
            <input
              id="rb-linkedin"
              className={inputClass}
              disabled={disabled}
              value={document.contact.linkedinUrl ?? ''}
              onChange={(event) => setContact('linkedinUrl', event.target.value)}
            />
          </Field>
          <Field label="GitHub" htmlFor="rb-github" hint="https://…">
            <input
              id="rb-github"
              className={inputClass}
              disabled={disabled}
              value={document.contact.githubUrl ?? ''}
              onChange={(event) => setContact('githubUrl', event.target.value)}
            />
          </Field>
          <Field label="Portfolio" htmlFor="rb-portfolio" hint="https://…">
            <input
              id="rb-portfolio"
              className={inputClass}
              disabled={disabled}
              value={document.contact.portfolioUrl ?? ''}
              onChange={(event) => setContact('portfolioUrl', event.target.value)}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------------------------------------------------- experience */}
      <Card>
        <CardHeader
          title="Experience"
          description="Bullet points describe what you actually did."
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                set('experience', [
                  ...document.experience,
                  {
                    company: '',
                    title: '',
                    isCurrent: false,
                    highlights: [],
                    technologies: [],
                  },
                ])
              }
            >
              Add role
            </Button>
          }
        />
        <div className="space-y-4 p-5">
          {document.experience.length === 0 ? (
            <p className="text-sm text-slate-500">No roles yet.</p>
          ) : null}
          {document.experience.map((item: ResumeExperience, index) => (
            <Row
              key={index}
              title={`Role ${index + 1}`}
              onRemove={() => set('experience', removeAt(document.experience, index))}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" htmlFor={`rb-exp-title-${index}`}>
                  <input
                    id={`rb-exp-title-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.title}
                    onChange={(event) =>
                      set('experience', updateAt(document.experience, index, { ...item, title: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Company" htmlFor={`rb-exp-company-${index}`}>
                  <input
                    id={`rb-exp-company-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.company}
                    onChange={(event) =>
                      set(
                        'experience',
                        updateAt(document.experience, index, { ...item, company: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Start" htmlFor={`rb-exp-start-${index}`} hint="YYYY-MM">
                  <input
                    id={`rb-exp-start-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.startDate ?? ''}
                    onChange={(event) =>
                      set(
                        'experience',
                        updateAt(document.experience, index, { ...item, startDate: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="End" htmlFor={`rb-exp-end-${index}`} hint="YYYY-MM, or leave blank">
                  <input
                    id={`rb-exp-end-${index}`}
                    className={inputClass}
                    // A current role has no end date; the checkbox below owns this
                    // field's disabled state once it is ticked.
                    disabled={disabled || item.isCurrent}
                    value={item.endDate ?? ''}
                    onChange={(event) =>
                      set(
                        'experience',
                        updateAt(document.experience, index, { ...item, endDate: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Location" htmlFor={`rb-exp-location-${index}`}>
                  <input
                    id={`rb-exp-location-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.location ?? ''}
                    onChange={(event) =>
                      set(
                        'experience',
                        updateAt(document.experience, index, { ...item, location: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Employment type" htmlFor={`rb-exp-type-${index}`}>
                  <input
                    id={`rb-exp-type-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.employmentType ?? ''}
                    onChange={(event) =>
                      set(
                        'experience',
                        updateAt(document.experience, index, {
                          ...item,
                          employmentType: event.target.value,
                        })
                      )
                    }
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={item.isCurrent}
                  onChange={(event) =>
                    set(
                      'experience',
                      updateAt(document.experience, index, {
                        ...item,
                        isCurrent: event.target.checked,
                        // A current role has no end date; clearing it stops the two
                        // contradicting each other on the printed page.
                        endDate: event.target.checked ? undefined : item.endDate,
                      })
                    )
                  }
                />
                I currently work here
              </label>
              <ListField
                label="Highlights"
                htmlFor={`rb-exp-highlights-${index}`}
                hint="One per line is ideal; commas also work."
                values={item.highlights}
                placeholder="Cut deploy time from 40 to 12 minutes"
                disabled={disabled}
                onChange={(next) =>
                  set('experience', updateAt(document.experience, index, { ...item, highlights: next }))
                }
              />
              <ListField
                label="Technologies"
                htmlFor={`rb-exp-tech-${index}`}
                values={item.technologies}
                disabled={disabled}
                onChange={(next) =>
                  set('experience', updateAt(document.experience, index, { ...item, technologies: next }))
                }
              />
            </Row>
          ))}
        </div>
      </Card>

      {/* ----------------------------------------------------------- education */}
      <Card>
        <CardHeader
          title="Education"
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => set('education', [...document.education, { institution: '' }])}
            >
              Add education
            </Button>
          }
        />
        <div className="space-y-4 p-5">
          {document.education.length === 0 ? (
            <p className="text-sm text-slate-500">No education yet.</p>
          ) : null}
          {document.education.map((item: ResumeEducation, index) => (
            <Row
              key={index}
              title={`Education ${index + 1}`}
              onRemove={() => set('education', removeAt(document.education, index))}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Institution" htmlFor={`rb-edu-inst-${index}`}>
                  <input
                    id={`rb-edu-inst-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.institution}
                    onChange={(event) =>
                      set(
                        'education',
                        updateAt(document.education, index, { ...item, institution: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Degree" htmlFor={`rb-edu-degree-${index}`}>
                  <input
                    id={`rb-edu-degree-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.degree ?? ''}
                    onChange={(event) =>
                      set(
                        'education',
                        updateAt(document.education, index, { ...item, degree: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Field of study" htmlFor={`rb-edu-field-${index}`}>
                  <input
                    id={`rb-edu-field-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.fieldOfStudy ?? ''}
                    onChange={(event) =>
                      set(
                        'education',
                        updateAt(document.education, index, { ...item, fieldOfStudy: event.target.value })
                      )
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Start year"
                    htmlFor={`rb-edu-start-${index}`}
                    value={item.startYear}
                    disabled={disabled}
                    onChange={(next) =>
                      set('education', updateAt(document.education, index, { ...item, startYear: next }))
                    }
                  />
                  <NumberField
                    label="End year"
                    htmlFor={`rb-edu-end-${index}`}
                    value={item.endYear}
                    disabled={disabled}
                    onChange={(next) =>
                      set('education', updateAt(document.education, index, { ...item, endYear: next }))
                    }
                  />
                </div>
                <Field label="Grade" htmlFor={`rb-edu-grade-${index}`}>
                  <input
                    id={`rb-edu-grade-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.grade ?? ''}
                    onChange={(event) =>
                      set('education', updateAt(document.education, index, { ...item, grade: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={`rb-edu-desc-${index}`}>
                <textarea
                  id={`rb-edu-desc-${index}`}
                  rows={2}
                  className={inputClass}
                  disabled={disabled}
                  value={item.description ?? ''}
                  onChange={(event) =>
                    set(
                      'education',
                      updateAt(document.education, index, { ...item, description: event.target.value })
                    )
                  }
                />
              </Field>
            </Row>
          ))}
        </div>
      </Card>

      {/* --------------------------------------------------------------- skills */}
      <Card>
        <CardHeader
          title="Skills"
          description="Order is the order they are printed in."
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => set('skills', [...document.skills, { name: '' }])}
            >
              Add skill
            </Button>
          }
        />
        <div className="space-y-3 p-5">
          {document.skills.length === 0 ? (
            <p className="text-sm text-slate-500">No skills yet.</p>
          ) : null}
          {document.skills.map((item: ResumeSkill, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Skill" htmlFor={`rb-skill-name-${index}`}>
                <input
                  id={`rb-skill-name-${index}`}
                  className={inputClass}
                  disabled={disabled}
                  value={item.name}
                  onChange={(event) =>
                    set('skills', updateAt(document.skills, index, { ...item, name: event.target.value }))
                  }
                />
              </Field>
              <Field label="Proficiency" htmlFor={`rb-skill-prof-${index}`}>
                <input
                  id={`rb-skill-prof-${index}`}
                  className={inputClass}
                  disabled={disabled}
                  value={item.proficiency ?? ''}
                  onChange={(event) =>
                    set('skills', updateAt(document.skills, index, { ...item, proficiency: event.target.value }))
                  }
                />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => set('skills', removeAt(document.skills, index))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------------- projects */}
      <Card>
        <CardHeader
          title="Projects"
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => set('projects', [...document.projects, { name: '', highlights: [], technologies: [] }])}
            >
              Add project
            </Button>
          }
        />
        <div className="space-y-4 p-5">
          {document.projects.length === 0 ? (
            <p className="text-sm text-slate-500">No projects yet.</p>
          ) : null}
          {document.projects.map((item: ResumeProject, index) => (
            <Row
              key={index}
              title={`Project ${index + 1}`}
              onRemove={() => set('projects', removeAt(document.projects, index))}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor={`rb-proj-name-${index}`}>
                  <input
                    id={`rb-proj-name-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.name}
                    onChange={(event) =>
                      set('projects', updateAt(document.projects, index, { ...item, name: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Link" htmlFor={`rb-proj-url-${index}`} hint="https://…">
                  <input
                    id={`rb-proj-url-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.url ?? ''}
                    onChange={(event) =>
                      set('projects', updateAt(document.projects, index, { ...item, url: event.target.value }))
                    }
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={`rb-proj-desc-${index}`}>
                <textarea
                  id={`rb-proj-desc-${index}`}
                  rows={2}
                  className={inputClass}
                  disabled={disabled}
                  value={item.description ?? ''}
                  onChange={(event) =>
                    set(
                      'projects',
                      updateAt(document.projects, index, { ...item, description: event.target.value })
                    )
                  }
                />
              </Field>
              <ListField
                label="Highlights"
                htmlFor={`rb-proj-highlights-${index}`}
                values={item.highlights}
                disabled={disabled}
                onChange={(next) =>
                  set('projects', updateAt(document.projects, index, { ...item, highlights: next }))
                }
              />
              <ListField
                label="Technologies"
                htmlFor={`rb-proj-tech-${index}`}
                values={item.technologies}
                disabled={disabled}
                onChange={(next) =>
                  set('projects', updateAt(document.projects, index, { ...item, technologies: next }))
                }
              />
            </Row>
          ))}
        </div>
      </Card>

      {/* ------------------------------------------------------ certifications */}
      <Card>
        <CardHeader
          title="Certifications"
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => set('certifications', [...document.certifications, { name: '' }])}
            >
              Add certification
            </Button>
          }
        />
        <div className="space-y-4 p-5">
          {document.certifications.length === 0 ? (
            <p className="text-sm text-slate-500">No certifications yet.</p>
          ) : null}
          {document.certifications.map((item: ResumeCertification, index) => (
            <Row
              key={index}
              title={`Certification ${index + 1}`}
              onRemove={() => set('certifications', removeAt(document.certifications, index))}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" htmlFor={`rb-cert-name-${index}`}>
                  <input
                    id={`rb-cert-name-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.name}
                    onChange={(event) =>
                      set(
                        'certifications',
                        updateAt(document.certifications, index, { ...item, name: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Issuer" htmlFor={`rb-cert-issuer-${index}`}>
                  <input
                    id={`rb-cert-issuer-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.issuer ?? ''}
                    onChange={(event) =>
                      set(
                        'certifications',
                        updateAt(document.certifications, index, { ...item, issuer: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Issued" htmlFor={`rb-cert-date-${index}`} hint="YYYY-MM">
                  <input
                    id={`rb-cert-date-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.issuedDate ?? ''}
                    onChange={(event) =>
                      set(
                        'certifications',
                        updateAt(document.certifications, index, { ...item, issuedDate: event.target.value })
                      )
                    }
                  />
                </Field>
                <Field label="Credential ID" htmlFor={`rb-cert-cred-${index}`}>
                  <input
                    id={`rb-cert-cred-${index}`}
                    className={inputClass}
                    disabled={disabled}
                    value={item.credentialId ?? ''}
                    onChange={(event) =>
                      set(
                        'certifications',
                        updateAt(document.certifications, index, { ...item, credentialId: event.target.value })
                      )
                    }
                  />
                </Field>
              </div>
            </Row>
          ))}
        </div>
      </Card>

      {/* ----------------------------------------------------------- languages */}
      <Card>
        <CardHeader
          title="Languages"
          action={
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => set('languages', [...document.languages, { name: '' }])}
            >
              Add language
            </Button>
          }
        />
        <div className="space-y-3 p-5">
          {document.languages.length === 0 ? (
            <p className="text-sm text-slate-500">No languages yet.</p>
          ) : null}
          {document.languages.map((item: ResumeLanguageEntry, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Language" htmlFor={`rb-lang-name-${index}`}>
                <input
                  id={`rb-lang-name-${index}`}
                  className={inputClass}
                  disabled={disabled}
                  value={item.name}
                  onChange={(event) =>
                    set('languages', updateAt(document.languages, index, { ...item, name: event.target.value }))
                  }
                />
              </Field>
              <Field label="Proficiency" htmlFor={`rb-lang-prof-${index}`}>
                <input
                  id={`rb-lang-prof-${index}`}
                  className={inputClass}
                  disabled={disabled}
                  value={item.proficiency ?? ''}
                  onChange={(event) =>
                    set(
                      'languages',
                      updateAt(document.languages, index, { ...item, proficiency: event.target.value })
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set('languages', removeAt(document.languages, index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Exported for the shell, which builds the empty document for a new resume. */
export type { ListKey };
