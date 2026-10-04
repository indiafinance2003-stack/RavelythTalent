'use client';

import type { ResumeDocument } from '@/lib/resume/content';
import {
  DEFAULT_RESUME_TEMPLATE,
  getTemplateLayout,
  type ResumeTemplateCode,
  type TemplateLayout,
} from '@/lib/resume/template-layouts';

/**
 * Live preview of the resume, laid out from the SAME layout data the PDF renderer
 * uses.
 *
 * This is not a generic "here is your text" card. It reads `sidebarRatio`,
 * `sidebarFill`, `headerBand`, `accent`, `accentSoft` and `density` from
 * `@/lib/resume/template-layouts` — the module `templates.ts` derives the PDF
 * theme from — so switching template visibly changes the arrangement:
 *
 *   - `compact` sets a smaller base type, matching the dense printed page;
 *   - `modern` and `technical` move skills/certifications/languages (and, for
 *     modern, education) into a filled sidebar;
 *   - `executive` draws the accent band behind the name block.
 *
 * Colours are applied through inline `style` rather than Tailwind classes on
 * purpose: the values come from data, and Tailwind cannot see data-generated class
 * names at build time, so a `bg-${colour}` template would silently render
 * unstyled.
 *
 * Everything is rendered as React text nodes. Nothing here interprets HTML, so
 * candidate content can never inject markup.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2021-03" / "2021-03-14" / "2021" / "present" → "Mar 2021". */
function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  if (value === 'present') return 'Present';
  const [year, month] = value.split('-');
  if (!year) return null;
  if (!month) return year;
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function period(start: string | undefined, end: string | undefined, isCurrent: boolean): string | null {
  const from = formatDate(start);
  const to = isCurrent ? 'Present' : formatDate(end);
  if (!from && !to) return null;
  return `${from ?? ''} – ${to ?? 'Present'}`.replace(/\s*–\s*$/, '').trim();
}

type SectionName =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'languages';

const ALL_SECTIONS: readonly SectionName[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
];

function hasContent(document: ResumeDocument, section: SectionName): boolean {
  switch (section) {
    case 'summary':
      return Boolean(document.basics.summary?.trim());
    case 'experience':
      return document.experience.length > 0;
    case 'education':
      return document.education.length > 0;
    case 'skills':
      return document.skills.length > 0;
    case 'projects':
      return document.projects.length > 0;
    case 'certifications':
      return document.certifications.length > 0;
    case 'languages':
      return document.languages.length > 0;
    default:
      return false;
  }
}

/**
 * Render order: the candidate's preference first, then anything they left out that
 * still has content — so hiding a section in the order list can never silently
 * drop work they entered. This mirrors `presentSections` on the server.
 */
function orderedSections(document: ResumeDocument): SectionName[] {
  const stored = document.sectionOrder?.filter((section): section is SectionName =>
    ALL_SECTIONS.includes(section as SectionName)
  );
  if (!stored || stored.length === 0) return ALL_SECTIONS.filter((s) => hasContent(document, s));
  return [...stored, ...ALL_SECTIONS.filter((s) => !stored.includes(s) && hasContent(document, s))];
}

function SectionHeading({ title, layout }: { title: string; layout: TemplateLayout }): React.ReactElement {
  return (
    <h3
      className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
      style={{ color: `#${layout.accent}` }}
    >
      {title}
    </h3>
  );
}

function SectionBody({
  section,
  document,
  layout,
}: {
  section: SectionName;
  document: ResumeDocument;
  layout: TemplateLayout;
}): React.ReactElement | null {
  const small = layout.density === 'compact' ? 'text-[0.62rem]' : 'text-[0.68rem]';
  const body = 'text-[0.7rem] leading-relaxed text-slate-300';

  switch (section) {
    case 'summary':
      return <p className={body}>{document.basics.summary}</p>;

    case 'experience':
      return (
        <ul className="space-y-2.5">
          {document.experience.map((item, index) => {
            const when = period(item.startDate, item.endDate, item.isCurrent);
            return (
              <li key={`${item.company}-${index}`}>
                <p className={small}>
                  <span className="font-semibold text-slate-100">{item.title}</span>
                  {item.company ? <span className="text-slate-400"> · {item.company}</span> : null}
                </p>
                {when || item.location ? (
                  <p className={`${small} text-slate-500`}>
                    {[when, item.location].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                {item.highlights.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-3">
                    {item.highlights.map((highlight, position) => (
                      <li key={position} className={body}>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      );

    case 'education':
      return (
        <ul className="space-y-2">
          {document.education.map((item, index) => (
            <li key={`${item.institution}-${index}`}>
              <p className={small}>
                <span className="font-semibold text-slate-100">{item.institution}</span>
              </p>
              {item.degree || item.fieldOfStudy ? (
                <p className={body}>
                  {[item.degree, item.fieldOfStudy].filter(Boolean).join(', ')}
                </p>
              ) : null}
              {item.endYear ? <p className={`${small} text-slate-500`}>{item.endYear}</p> : null}
            </li>
          ))}
        </ul>
      );

    case 'skills':
      return (
        <ul className="flex flex-wrap gap-1">
          {document.skills.map((skill, index) => (
            <li
              key={`${skill.name}-${index}`}
              className="rounded px-1.5 py-0.5 text-[0.62rem]"
              style={{ backgroundColor: `#${layout.accentSoft}`, color: `#${layout.accent}` }}
            >
              {skill.name}
            </li>
          ))}
        </ul>
      );

    case 'projects':
      return (
        <ul className="space-y-2">
          {document.projects.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <p className={small}>
                <span className="font-semibold text-slate-100">{item.name}</span>
                {item.url ? <span className="text-slate-500"> · {item.url}</span> : null}
              </p>
              {item.description ? <p className={body}>{item.description}</p> : null}
            </li>
          ))}
        </ul>
      );

    case 'certifications':
      return (
        <ul className="space-y-1.5">
          {document.certifications.map((item, index) => (
            <li key={`${item.name}-${index}`} className={body}>
              <span className="font-semibold text-slate-100">{item.name}</span>
              {item.issuer ? <span className="text-slate-500"> · {item.issuer}</span> : null}
            </li>
          ))}
        </ul>
      );

    case 'languages':
      return (
        <ul className="space-y-1">
          {document.languages.map((item, index) => (
            <li key={`${item.name}-${index}`} className={body}>
              {item.name}
              {item.proficiency ? (
                <span className="text-slate-500"> · {item.proficiency}</span>
              ) : null}
            </li>
          ))}
        </ul>
      );

    default:
      return null;
  }
}

const TITLES: Record<SectionName, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
};

export function ResumePreview({
  document,
  templateCode,
}: {
  document: ResumeDocument;
  templateCode: string | null;
}): React.ReactElement {
  const layout = getTemplateLayout(templateCode ?? DEFAULT_RESUME_TEMPLATE);
  const sections = orderedSections(document);

  const contact = [document.contact.email, document.contact.phone, document.contact.location]
    .filter((value): value is string => Boolean(value?.trim()))
    .join('  ·  ');

  // Sections the template routes into the sidebar, and everything else.
  const sidebarSections = sections.filter((section) => layout.sidebarSections.includes(section));
  const mainSections = sections.filter((section) => !layout.sidebarSections.includes(section));

  const main = (
    <div className="space-y-4">
      {mainSections.map((section) => (
        <section key={section}>
          <SectionHeading title={TITLES[section]} layout={layout} />
          <SectionBody section={section} document={document} layout={layout} />
        </section>
      ))}
    </div>
  );

  const sidebar =
    sidebarSections.length > 0 ? (
      <aside
        className="space-y-4 p-3"
        style={{
          width: `${Math.round(layout.sidebarRatio * 100)}%`,
          backgroundColor: layout.sidebarFill ? `#${layout.sidebarFill}` : undefined,
        }}
      >
        {sidebarSections.map((section) => (
          <section key={section}>
            <SectionHeading title={TITLES[section]} layout={layout} />
            <SectionBody section={section} document={document} layout={layout} />
          </section>
        ))}
      </aside>
    ) : null;

  const nameBlock = (
    <div className="px-4 py-3">
      <h2
        className="text-base font-semibold leading-tight"
        style={{ color: layout.headerBand ? '#ffffff' : undefined }}
      >
        {document.basics.fullName || 'Your name'}
      </h2>
      {document.basics.headline ? (
        <p
          className="mt-0.5 text-[0.7rem]"
          style={{
            color: layout.headerBand ? '#ffffff' : `#${layout.accent}`,
            opacity: layout.headerBand ? 0.85 : 1,
          }}
        >
          {document.basics.headline}
        </p>
      ) : null}
      {contact ? (
        <p
          className="mt-1 text-[0.6rem] leading-snug"
          style={{
            color: layout.headerBand ? '#ffffff' : undefined,
            opacity: layout.headerBand ? 0.8 : 1,
          }}
        >
          {contact}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      className="overflow-hidden rounded-lg border border-line bg-white"
      data-template-code={layout.code}
      data-sidebar-sections={sidebarSections.join(',')}
      style={{ fontSize: layout.density === 'compact' ? '11px' : '12px' }}
    >
      {layout.headerBand ? (
        <div style={{ backgroundColor: `#${layout.accent}` }}>{nameBlock}</div>
      ) : (
        <div className="border-b border-line">{nameBlock}</div>
      )}

      {sidebar ? (
        <div className="flex items-start">
          <div className="flex-1 p-4">{main}</div>
          {sidebar}
        </div>
      ) : (
        <div className="p-4">{main}</div>
      )}
    </div>
  );
}

/** Exposed for the template picker, which needs each layout's shape. */
export type { ResumeTemplateCode };
