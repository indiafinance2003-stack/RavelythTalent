import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RESUME_TEMPLATE,
  FREE_RESUME_TEMPLATE_CODES,
  PREMIUM_RESUME_TEMPLATE_CODES,
  RESUME_TEMPLATE_CODES,
  RESUME_TEMPLATE_LAYOUTS,
  getTemplateLayout,
  isPremiumResumeTemplateCode,
  isResumeTemplateCode,
} from '@/lib/resume/template-layouts';
import {
  RESUME_TEMPLATES,
  placementFor,
  resolveResumeTemplate,
} from '@/lib/resume/templates';

/**
 * The browser-safe layout catalogue and the PDF renderer must describe the SAME
 * five templates.
 *
 * `templates.ts` is `server-only` (it imports the PDF writer), so the builder UI
 * cannot import it and shows the layout from `template-layouts.ts` instead. That
 * split is only safe while the two agree. If they drift, the builder previews one
 * arrangement while the candidate's downloaded PDF is another, and nothing in the
 * product would reveal it: the export succeeds, the PDF is valid, and the layout
 * is simply wrong.
 *
 * So every fact the preview depends on is asserted here against the renderer's
 * derived templates.
 */
describe('resume template layout catalogue', () => {
  it('covers exactly the five seeded templates', () => {
    expect([...RESUME_TEMPLATE_CODES].sort()).toEqual(
      ['classic', 'compact', 'executive', 'modern', 'technical'].sort()
    );
  });

  it.each([...RESUME_TEMPLATE_CODES])('renderer and catalogue agree on %s', (code) => {
    const layout = RESUME_TEMPLATE_LAYOUTS[code];
    const template = RESUME_TEMPLATES[code];

    expect(template.code).toBe(layout.code);
    expect(template.name).toBe(layout.name);
    expect(template.description).toBe(layout.description);
    expect(template.margins).toEqual(layout.margins);
    expect(template.sidebarRatio).toBe(layout.sidebarRatio);
    expect(template.sidebarFill).toBe(layout.sidebarFill);
    expect(template.density).toBe(layout.density);
    expect(template.headerBand).toBe(layout.headerBand);

    // The accent colours the preview paints must be the ones the PDF prints.
    expect(template.theme.accent).toBe(layout.accent);
    expect(template.theme.accentSoft).toBe(layout.accentSoft);
  });

  it.each([...RESUME_TEMPLATE_CODES])('sidebar sections drive placements for %s', (code) => {
    const layout = RESUME_TEMPLATE_LAYOUTS[code];
    const template = RESUME_TEMPLATES[code];

    for (const section of layout.sidebarSections) {
      expect(placementFor(template, section)).toBe('sidebar');
    }

    // And nothing the preview claims is in the sidebar is actually in the main
    // column: a section absent from sidebarSections must not be a sidebar section.
    const allSections = [
      'summary',
      'experience',
      'education',
      'skills',
      'projects',
      'certifications',
      'languages',
    ];
    for (const section of allSections) {
      const expected = layout.sidebarSections.includes(section) ? 'sidebar' : 'main';
      expect(placementFor(template, section)).toBe(expected);
    }
  });

  it('classifies premium templates identically in both modules', () => {
    for (const code of RESUME_TEMPLATE_CODES) {
      expect(isPremiumResumeTemplateCode(code)).toBe(RESUME_TEMPLATE_LAYOUTS[code].isPremium);
    }
    expect([...PREMIUM_RESUME_TEMPLATE_CODES].sort()).toEqual(['executive', 'modern', 'technical']);
    expect([...FREE_RESUME_TEMPLATE_CODES].sort()).toEqual(['classic', 'compact']);
  });

  it('keeps the two free templates free and the three paid ones paid', () => {
    // This split is load-bearing: `professional_resume_templates` is what the
    // service enforces, and it is seeded in the database with exactly these flags.
    expect(RESUME_TEMPLATE_LAYOUTS.classic.isPremium).toBe(false);
    expect(RESUME_TEMPLATE_LAYOUTS.compact.isPremium).toBe(false);
    expect(RESUME_TEMPLATE_LAYOUTS.modern.isPremium).toBe(true);
    expect(RESUME_TEMPLATE_LAYOUTS.executive.isPremium).toBe(true);
    expect(RESUME_TEMPLATE_LAYOUTS.technical.isPremium).toBe(true);
  });

  it('gives each template a genuinely distinct arrangement', () => {
    // A "template" that renders identically to another is a recolouring, not a
    // layout. The five must differ in structure, not only in colour.
    const signatures = RESUME_TEMPLATE_CODES.map((code) => {
      const layout = RESUME_TEMPLATE_LAYOUTS[code];
      return [
        layout.sidebarRatio > 0 ? 'sidebar' : 'single',
        layout.headerBand ? 'band' : 'plain',
        layout.density,
        [...layout.sidebarSections].sort().join('+'),
      ].join('|');
    });

    expect(new Set(signatures).size).toBe(RESUME_TEMPLATE_CODES.length);
  });

  it('defaults an unknown or missing code to the free classic template', () => {
    // Must never resolve to a premium layout implicitly, or an unrecognised stored
    // code would hand a candidate a paid design for free.
    expect(getTemplateLayout(null).code).toBe(DEFAULT_RESUME_TEMPLATE);
    expect(getTemplateLayout('nope').code).toBe(DEFAULT_RESUME_TEMPLATE);
    expect(resolveResumeTemplate(null).code).toBe(DEFAULT_RESUME_TEMPLATE);
    expect(resolveResumeTemplate('nope').code).toBe(DEFAULT_RESUME_TEMPLATE);
    expect(RESUME_TEMPLATE_LAYOUTS[DEFAULT_RESUME_TEMPLATE].isPremium).toBe(false);
  });

  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
    'resolves the inherited property name %s to the default, not to a prototype member',
    (name) => {
      // An `in`/index lookup on the template map would happily return
      // Object.prototype members for these, handing the renderer a function where
      // a template is expected.
      expect(getTemplateLayout(name).code).toBe(DEFAULT_RESUME_TEMPLATE);
      expect(resolveResumeTemplate(name).code).toBe(DEFAULT_RESUME_TEMPLATE);
    }
  );

  it('recognises exactly the five codes', () => {
    expect(isResumeTemplateCode('classic')).toBe(true);
    expect(isResumeTemplateCode('executive')).toBe(true);
    expect(isResumeTemplateCode('')).toBe(false);
    expect(isResumeTemplateCode('Classic')).toBe(false);
    expect(isResumeTemplateCode('toString')).toBe(false);
  });
});
