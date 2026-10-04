import 'server-only';

import { PDF_FONT_BOLD, PDF_FONT_ITALIC, PDF_FONT_REGULAR, PDF_FONT_SERIF_BOLD } from './fonts';
import { PdfWriter } from './document';
import { formatDate } from '@/lib/portal-client/format';
import {
  SECTION_LABELS,
  presentSections,
  type ResumeDocument,
  type ResumeSection,
} from '@/lib/resume/content';
import { placementFor, resolveResumeTemplate, type ResumeTemplate } from '@/lib/resume/templates';

/**
 * Resume PDF rendering.
 *
 * The renderer is deliberately the ONLY place that knows how to turn a
 * `ResumeDocument` into a page. It reads validated data and prints it; it never
 * fetches, never invents a value, and never renders a section the candidate left
 * empty. A missing field is omitted rather than filled with a placeholder,
 * because a resume containing "N/A" in the summary is worse than a shorter one.
 */

export interface ResumeRenderOptions {
  templateCode?: string | null;
  /** Shown in the footer and PDF metadata. */
  candidateName: string;
  /** Rendered date stamp; injected so tests are deterministic. */
  generatedAt?: Date;
}

export interface RenderedResume {
  body: Buffer;
  template: ResumeTemplate;
  /** Sections that actually had content and were printed. */
  renderedSections: ResumeSection[];
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2021-03" / "2021-03-14" / "2021" / "present" → "Mar 2021". */
function formatResumeDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value === 'present') return 'Present';

  const [year, month, day] = value.split('-');
  if (!year) return fallback;
  if (!month) return year;
  if (!day) return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function dateRange(start: string | undefined, end: string | undefined, isCurrent: boolean): string {
  const from = formatResumeDate(start, '');
  const to = isCurrent ? 'Present' : formatResumeDate(end, 'Present');
  if (!from) return to;
  return `${from} – ${to}`;
}

function yearRange(start?: number, end?: number): string {
  if (!start && !end) return '';
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start}`;
  return `${end}`;
}

/** Contact details, filtered to what the candidate actually filled in. */
function contactLines(document: ResumeDocument): string[] {
  const lines: string[] = [];
  const { contact } = document;
  if (contact.location) lines.push(contact.location);
  if (contact.phone) lines.push(contact.phone);
  if (contact.email) lines.push(contact.email);
  if (contact.linkedinUrl) lines.push(contact.linkedinUrl);
  if (contact.githubUrl) lines.push(contact.githubUrl);
  if (contact.portfolioUrl) lines.push(contact.portfolioUrl);
  if (contact.websiteUrl) lines.push(contact.websiteUrl);
  return lines;
}

/** Wraps a list into comma-separated runs that fit `width`, without mid-word cuts. */
function chunkByWidth(
  writer: PdfWriter,
  items: string[],
  width: number,
  size: number
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const item of items) {
    const candidate = current ? `${current}, ${item}` : item;
    if (current && writer.widthOf(candidate, { size }) > width) {
      lines.push(current);
      current = item;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ------------------------------------------------------------------ sections */

function renderSummary(writer: PdfWriter, document: ResumeDocument, size: number): void {
  writer.paragraph(document.basics.summary!.trim(), { size: size + 0.5, ensure: size * 2 });
}

function renderExperience(writer: PdfWriter, document: ResumeDocument, size: number): void {
  const small = size - 1;

  for (const role of document.experience) {
    const meta = dateRange(role.startDate, role.endDate, role.isCurrent);
    const periodHeight = writer.measure(role.title, { size: size + 1 });
    writer.ensureSpace(periodHeight + small * 4);

    writer.inlinePair(role.title, meta, { labelWidth: writer.width * 0.62, size: size + 1 });

    const sub: string[] = [role.company];
    if (role.location) sub.push(role.location);
    if (role.employmentType) sub.push(role.employmentType.replace(/_/g, ' '));
    if (sub.length > 0) {
      writer.text(sub.join(' · '), { size: small, color: writer.theme.muted });
    }

    if (role.highlights.length > 0) {
      writer.moveDown(2);
      writer.bullets(role.highlights, { size });
    }
    if (role.technologies.length > 0) {
      writer.moveDown(2);
      writer.text(`Technologies: ${role.technologies.join(', ')}`, {
        size: small,
        color: writer.theme.muted,
      });
    }
    writer.moveDown(size * 0.7);
  }
}

function renderEducation(writer: PdfWriter, document: ResumeDocument, size: number): void {
  const small = size - 1;

  for (const entry of document.education) {
    const headline = [entry.degree, entry.fieldOfStudy].filter(Boolean).join(', ');
    const years = yearRange(entry.startYear, entry.endYear);
    const label = headline || entry.institution;

    writer.inlinePair(label, years, { labelWidth: writer.width * 0.7, size: size + 0.5 });
    writer.text(entry.institution, { size, color: writer.theme.muted });
    if (entry.grade) {
      writer.text(`Grade: ${entry.grade}`, { size: small, color: writer.theme.muted });
    }
    if (entry.description) {
      writer.moveDown(1);
      writer.paragraph(entry.description, { size: small });
    }
    writer.moveDown(size * 0.6);
  }
}

function renderSkills(writer: PdfWriter, document: ResumeDocument, size: number): void {
  const body = size - 0.5;
  for (const skill of document.skills) {
    const suffix = skill.yearsOfExperience
      ? ` (${skill.yearsOfExperience} yr${skill.yearsOfExperience === 1 ? '' : 's'})`
      : '';
    const label = `${skill.name}${suffix}`;
    const detail = skill.proficiency ? ` — ${skill.proficiency}` : '';
    writer.definitionRow(label, detail.trim(), { size: body });
  }
  writer.moveDown(2);
}

function renderProjects(writer: PdfWriter, document: ResumeDocument, size: number): void {
  const small = size - 1;

  for (const project of document.projects) {
    writer.inlinePair(project.name, project.url ?? '', {
      labelWidth: writer.width * 0.65,
      size: size + 1,
    });
    if (project.description) {
      writer.paragraph(project.description, { size });
    }
    if (project.highlights.length > 0) {
      writer.moveDown(2);
      writer.bullets(project.highlights, { size });
    }
    if (project.technologies.length > 0) {
      writer.moveDown(2);
      writer.text(project.technologies.join(' · '), { size: small, color: writer.theme.muted });
    }
    writer.moveDown(size * 0.7);
  }
}

function renderCertifications(writer: PdfWriter, document: ResumeDocument, size: number): void {
  const body = size - 0.5;
  for (const entry of document.certifications) {
    const when = formatResumeDate(entry.issuedDate, '');
    const label = [entry.name, entry.issuer].filter(Boolean).join(' — ');
    writer.definitionRow(label, when, { size: body });
    if (entry.credentialId) {
      writer.text(`Credential ID: ${entry.credentialId}`, {
        size: body - 0.5,
        color: writer.theme.muted,
        indent: 0,
      });
    }
    if (entry.url) {
      writer.text(entry.url, { size: body - 0.5, color: writer.theme.accent });
    }
  }
  writer.moveDown(2);
}

function renderLanguages(writer: PdfWriter, document: ResumeDocument, size: number): void {
  for (const entry of document.languages) {
    writer.definitionRow(entry.name, entry.proficiency ?? '', { size: size - 0.5 });
  }
  writer.moveDown(2);
}

type SectionRenderer = (writer: PdfWriter, document: ResumeDocument, size: number) => void;

const SECTION_RENDERERS: Record<ResumeSection, SectionRenderer> = {
  summary: renderSummary,
  experience: renderExperience,
  education: renderEducation,
  skills: renderSkills,
  projects: renderProjects,
  certifications: renderCertifications,
  languages: renderLanguages,
};

/* --------------------------------------------------------------- entry point */

export async function renderResumePdf(
  document: ResumeDocument,
  options: ResumeRenderOptions
): Promise<RenderedResume> {
  const template = resolveResumeTemplate(options.templateCode);
  const generatedAt = options.generatedAt ?? new Date();
  const baseSize = template.density === 'compact' ? 8.6 : 9.6;

  const writer = new PdfWriter({
    title: `${document.basics.fullName} — Resume`,
    subject: document.basics.headline ?? 'Resume',
    author: document.basics.fullName,
    keywords: document.skills.map((skill) => skill.name).join(', '),
    theme: template.theme,
    margins: template.margins,
    footer: `Generated by Ravelyth Talent on ${formatDate(generatedAt.toISOString())}`,
  });

  const sections = presentSections(document);
  const sidebarSections = sections.filter((section) => placementFor(template, section) === 'sidebar');
  const mainSections = sections.filter((section) => placementFor(template, section) === 'main');

  const drawNameBlock = (): void => {
    if (template.headerBand) {
      writer.accentBar(6);
      writer.moveDown(10);
    }
    writer.text(document.basics.fullName, {
      font: PDF_FONT_SERIF_BOLD,
      size: baseSize + (template.density === 'compact' ? 6 : 9),
      color: template.headerBand ? writer.theme.text : writer.theme.accent,
    });
    if (document.basics.headline) {
      writer.text(document.basics.headline, {
        font: PDF_FONT_ITALIC,
        size: baseSize + 1.5,
        color: writer.theme.muted,
      });
    }
    writer.moveDown(4);
  };

  const drawContact = (): void => {
    const lines = contactLines(document);
    if (lines.length === 0) return;
    if (template.sidebarRatio > 0) {
      // In a sidebar each entry gets its own line so nothing is squeezed.
      for (const line of lines) {
        writer.text(line, { size: baseSize - 0.8, color: writer.theme.text });
      }
    } else {
      const packed = chunkByWidth(writer, lines, writer.width, baseSize - 0.8);
      for (const line of packed) {
        writer.text(line, { size: baseSize - 0.8, color: writer.theme.text });
      }
    }
    writer.moveDown(6);
  };

  if (template.sidebarRatio > 0) {
    const gutter = 18;
    const total = writer.width;
    const sidebarWidth = Math.round(total * template.sidebarRatio);
    const mainLeft = writer.left + sidebarWidth + gutter;
    const mainWidth = total - sidebarWidth - gutter;
    const sidebarLeft = writer.left;

    writer.withRegion(mainLeft, mainWidth, null, () => {
      drawNameBlock();
      // The summary sits directly under the name in the main column rather than
      // in the sidebar: it is the first thing a recruiter reads and the sidebar is
      // too narrow to carry a paragraph well.
      if (mainSections.includes('summary')) {
        renderSummary(writer, document, baseSize);
        writer.moveDown(4);
      }
      for (const section of mainSections) {
        if (section === 'summary') continue;
        writer.sectionHeading(SECTION_LABELS[section]);
        SECTION_RENDERERS[section](writer, document, baseSize);
      }
    });

    writer.withRegion(sidebarLeft, sidebarWidth, template.sidebarFill, () => {
      writer.doc.y = template.margins.top;
      writer.accentBar(6, template.theme.accent, 0);
      writer.moveDown(10);
      drawContact();
      for (const section of sidebarSections) {
        writer.sectionHeading(SECTION_LABELS[section]);
        SECTION_RENDERERS[section](writer, document, baseSize);
      }
    });
  } else {
    drawNameBlock();
    drawContact();
    writer.rule(template.theme.accent, 1.5);
    writer.moveDown(10);

    for (const section of mainSections) {
      writer.sectionHeading(SECTION_LABELS[section]);
      SECTION_RENDERERS[section](writer, document, baseSize);
    }
  }

  const body = await writer.finish();
  return { body, template, renderedSections: sections };
}

/** Exposed for the template picker UI; keeps label copy in one place. */
export { SECTION_LABELS };
export { PDF_FONT_BOLD, PDF_FONT_REGULAR };
