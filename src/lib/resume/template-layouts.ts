/**
 * The identity and layout of each resume template, in ONE browser-safe place.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `templates.ts`
 * --------------------------------------------------
 * `templates.ts` builds the actual PDF — it imports `pdf/document.ts`, which is
 * `server-only`. A client component therefore cannot import it. The builder needs
 * to show the candidate what the chosen layout will look like, which means the
 * browser needs the layout facts.
 *
 * Copying those facts into a second file would guarantee drift: the preview would
 * happily show a two-column sidebar for a template the PDF renders as a single
 * column, and nothing would fail. So the layout lives HERE and `templates.ts`
 * derives the PDF theme from it. There is exactly one description of each
 * template, and `tests/unit/resume/template-layouts.test.ts` asserts the two
 * modules agree.
 *
 * Template identity is ultimately the DATABASE's: `resume_templates` rows seeded
 * by `drizzle/0013_watery_groot.sql`. This module mirrors those rows. The premium
 * flags here match `is_premium`, which is what the service actually enforces.
 */

export type ResumeTemplateCode = 'classic' | 'compact' | 'modern' | 'executive' | 'technical';

export interface TemplateMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TemplateLayout {
  code: ResumeTemplateCode;
  name: string;
  description: string;
  /** Mirrors `resume_templates.is_premium`; this is the paid flag. */
  isPremium: boolean;
  /** Hex WITHOUT a leading '#', matching the PDF theme convention. */
  accent: string;
  accentSoft: string;
  margins: TemplateMargins;
  /** Fraction of the page width taken by the sidebar; 0 for a single column. */
  sidebarRatio: number;
  /** Sidebar background, or null to leave it white. */
  sidebarFill: string | null;
  density: 'comfortable' | 'compact';
  /** Draws a full-width accent band behind the name block. */
  headerBand: boolean;
  /** Sections that render in the sidebar rather than the main column. */
  sidebarSections: readonly string[];
}

const NAVY = '1e3a8a';

export const RESUME_TEMPLATE_LAYOUTS: Record<ResumeTemplateCode, TemplateLayout> = {
  classic: {
    code: 'classic',
    name: 'Classic',
    description: 'A single-column layout with clear section headings. Suitable for most roles.',
    isPremium: false,
    accent: NAVY,
    accentSoft: 'eef2ff',
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    sidebarRatio: 0,
    sidebarFill: null,
    density: 'comfortable',
    headerBand: false,
    sidebarSections: [],
  },

  compact: {
    code: 'compact',
    name: 'Compact',
    description: 'A dense single-page layout that fits more experience onto one page.',
    isPremium: false,
    accent: '334155',
    accentSoft: 'f1f5f9',
    margins: { top: 34, right: 36, bottom: 34, left: 36 },
    sidebarRatio: 0,
    sidebarFill: null,
    density: 'compact',
    headerBand: false,
    sidebarSections: [],
  },

  modern: {
    code: 'modern',
    name: 'Modern',
    description: 'A two-column layout with a coloured sidebar for contact details and skills.',
    isPremium: true,
    accent: '0f766e',
    accentSoft: 'ccfbf1',
    margins: { top: 40, right: 40, bottom: 40, left: 40 },
    sidebarRatio: 0.3,
    sidebarFill: 'f0fdfa',
    density: 'comfortable',
    headerBand: false,
    sidebarSections: ['skills', 'languages', 'certifications', 'education'],
  },

  executive: {
    code: 'executive',
    name: 'Executive',
    description: 'A spacious layout designed for senior and leadership roles.',
    isPremium: true,
    accent: '7c2d12',
    accentSoft: 'fef3c7',
    margins: { top: 44, right: 44, bottom: 44, left: 44 },
    sidebarRatio: 0,
    sidebarFill: null,
    density: 'comfortable',
    headerBand: true,
    sidebarSections: [],
  },

  technical: {
    code: 'technical',
    name: 'Technical',
    description: 'A layout that foregrounds projects, technologies and engineering work.',
    isPremium: true,
    accent: '4338ca',
    accentSoft: 'eef2ff',
    margins: { top: 38, right: 38, bottom: 38, left: 38 },
    sidebarRatio: 0.26,
    sidebarFill: 'eef2ff',
    density: 'comfortable',
    headerBand: true,
    sidebarSections: ['skills', 'certifications', 'languages'],
  },
};

export const RESUME_TEMPLATE_CODES: readonly ResumeTemplateCode[] = [
  'classic',
  'compact',
  'modern',
  'executive',
  'technical',
];

/** Templates that require `professional_resume_templates`. Mirrors the database. */
export const PREMIUM_RESUME_TEMPLATE_CODES: readonly ResumeTemplateCode[] =
  RESUME_TEMPLATE_CODES.filter((code) => RESUME_TEMPLATE_LAYOUTS[code].isPremium);

/** Templates a candidate may use with no premium plan at all. */
export const FREE_RESUME_TEMPLATE_CODES: readonly ResumeTemplateCode[] =
  RESUME_TEMPLATE_CODES.filter((code) => !RESUME_TEMPLATE_LAYOUTS[code].isPremium);

/** The fallback for a null, unknown or inactive template code. */
export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateCode = 'classic';

export function isResumeTemplateCode(value: string): value is ResumeTemplateCode {
  return (RESUME_TEMPLATE_CODES as readonly string[]).includes(value);
}

export function isPremiumResumeTemplateCode(code: ResumeTemplateCode): boolean {
  return RESUME_TEMPLATE_LAYOUTS[code].isPremium;
}

/** Resolves a code to its layout, defaulting rather than throwing. */
export function getTemplateLayout(code: string | null | undefined): TemplateLayout {
  if (code && isResumeTemplateCode(code)) return RESUME_TEMPLATE_LAYOUTS[code];
  return RESUME_TEMPLATE_LAYOUTS[DEFAULT_RESUME_TEMPLATE];
}

/** Section placements derived from `sidebarSections`. */
export type SectionPlacement = 'main' | 'sidebar';
