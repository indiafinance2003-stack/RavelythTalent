import { DEFAULT_PDF_THEME, type PdfMargins, type PdfTheme } from '@/lib/pdf/document';
import {
  DEFAULT_RESUME_TEMPLATE,
  RESUME_TEMPLATE_LAYOUTS,
  isResumeTemplateCode,
  type ResumeTemplateCode,
  type SectionPlacement,
  type TemplateLayout,
} from './template-layouts';

/**
 * The five Resume Builder templates, as the PDF renderer sees them.
 *
 * This module adds nothing but the PDF theme: the code, name, description,
 * premium flag, margins, sidebar ratio, header band and section placements all
 * come from `./template-layouts`, which is browser-safe so the builder UI can
 * show the real layout. Deriving rather than repeating is what keeps the preview
 * and the printed page from disagreeing.
 *
 * These codes are the ones seeded in `drizzle/0013_watery_groot.sql` and gated by
 * `resume_templates.is_premium` + the `professional_resume_templates` entitlement
 * in the service layer. Adding a code here that is not in the database, or
 * rendering a premium layout without the check, would sell something the server
 * does not enforce — so the entitlement is decided in the service, never here.
 *
 * Each template is a distinct arrangement, not a recolouring: a two-column
 * sidebar, a dense single column, a leadership-forward layout with a wide header
 * band, and so on.
 */

export type { ResumeTemplateCode, SectionPlacement, TemplateLayout };

export {
  DEFAULT_RESUME_TEMPLATE,
  FREE_RESUME_TEMPLATE_CODES,
  PREMIUM_RESUME_TEMPLATE_CODES,
  RESUME_TEMPLATE_CODES,
  RESUME_TEMPLATE_LAYOUTS,
  getTemplateLayout,
  isPremiumResumeTemplateCode,
  isResumeTemplateCode,
} from './template-layouts';

export interface ResumeTemplate {
  code: ResumeTemplateCode;
  name: string;
  description: string;
  theme: PdfTheme;
  margins: PdfMargins;
  /** Fraction of the page width taken by the sidebar, or 0 for single column. */
  sidebarRatio: number;
  placements: Partial<Record<string, SectionPlacement>>;
  /** Sidebar background; null leaves the sidebar white. */
  sidebarFill: string | null;
  /** Scales body copy down for the dense layout. */
  density: 'comfortable' | 'compact';
  /** Draws a full-width accent band behind the name block. */
  headerBand: boolean;
}

/** Turns a layout descriptor into the renderer's template. */
function toTemplate(layout: TemplateLayout): ResumeTemplate {
  const placements: Partial<Record<string, SectionPlacement>> = {};
  for (const section of layout.sidebarSections) {
    placements[section] = 'sidebar';
  }

  return {
    code: layout.code,
    name: layout.name,
    description: layout.description,
    theme: { ...DEFAULT_PDF_THEME, accent: layout.accent, accentSoft: layout.accentSoft },
    margins: layout.margins,
    sidebarRatio: layout.sidebarRatio,
    placements,
    sidebarFill: layout.sidebarFill,
    density: layout.density,
    headerBand: layout.headerBand,
  };
}

export const RESUME_TEMPLATES: Record<ResumeTemplateCode, ResumeTemplate> = {
  classic: toTemplate(RESUME_TEMPLATE_LAYOUTS.classic),
  compact: toTemplate(RESUME_TEMPLATE_LAYOUTS.compact),
  modern: toTemplate(RESUME_TEMPLATE_LAYOUTS.modern),
  executive: toTemplate(RESUME_TEMPLATE_LAYOUTS.executive),
  technical: toTemplate(RESUME_TEMPLATE_LAYOUTS.technical),
};

/** Resolves a stored template code to a template, defaulting rather than throwing. */
export function resolveResumeTemplate(code: string | null | undefined): ResumeTemplate {
  // `isResumeTemplateCode` membership-checks the known list. An `in` test would
  // also match inherited names, so a stored code of "toString" would resolve to
  // `Object.prototype.toString` — a function, not a template — and blow up deep
  // inside the renderer with an unrelated error.
  if (code && isResumeTemplateCode(code)) return RESUME_TEMPLATES[code];
  return RESUME_TEMPLATES[DEFAULT_RESUME_TEMPLATE];
}

export function placementFor(template: ResumeTemplate, section: string): SectionPlacement {
  return template.placements[section] ?? 'main';
}
