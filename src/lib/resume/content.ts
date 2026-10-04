import { z } from 'zod';

/**
 * The Resume Builder document model.
 *
 * WHY THIS IS A VALIDATED SHAPE AND NOT `Record<string, unknown>`
 *
 * The builder's JSON is rendered straight into a PDF, and that PDF is a document
 * a candidate sends to an employer. Three things follow from that:
 *
 *  1. The renderer must never have to defend itself. Every field it reads is
 *     validated here, once, at the edge — so the renderer can treat a
 *     `ResumeDocument` as trustworthy instead of re-checking `typeof x === 'string'`
 *     in a dozen places.
 *  2. A stored document must still render years later. If the shape drifts, an
 *     old resume cannot be exported at all. That is why parsing is lenient about
 *     unknown keys and only strict about the fields the renderer touches.
 *  3. Bad input is rejected with a message a candidate can act on. Zod issues
 *     are flattened to `field: problem` strings instead of leaking a schema.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** A URL, restricted to http/https so a resume cannot carry `javascript:`. */
const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an http(s) URL');

const optionalHttpUrl = z
  .union([httpUrl, z.literal('')])
  .optional()
  .transform((value) => (value ? value : undefined));

export const resumeDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'must be YYYY, YYYY-MM or YYYY-MM-DD')
  .or(z.literal('present'))
  .or(z.literal(''));

const optionalDate = resumeDateSchema
  .optional()
  .transform((value) => (value ? value : undefined));

/** One line of a bullet list. Bullets are plain strings so the UI stays simple. */
const bulletList = z.array(trimmed(600)).max(20).default([]);

export const resumeExperienceSchema = z.object({
  company: trimmed(160).min(1, 'is required'),
  title: trimmed(160).min(1, 'is required'),
  location: trimmed(160).optional(),
  employmentType: trimmed(60).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  isCurrent: z.boolean().default(false),
  /** Bullet points describing what the candidate actually did. */
  highlights: bulletList,
  technologies: z.array(trimmed(60)).max(24).default([]),
});

export const resumeEducationSchema = z.object({
  institution: trimmed(200).min(1, 'is required'),
  degree: trimmed(160).optional(),
  fieldOfStudy: trimmed(160).optional(),
  startYear: z.number().int().min(1900).max(2200).optional(),
  endYear: z.number().int().min(1900).max(2200).optional(),
  grade: trimmed(80).optional(),
  description: trimmed(1200).optional(),
});

export const resumeProjectSchema = z.object({
  name: trimmed(160).min(1, 'is required'),
  url: optionalHttpUrl,
  description: trimmed(1200).optional(),
  highlights: bulletList,
  technologies: z.array(trimmed(60)).max(24).default([]),
});

export const resumeCertificationSchema = z.object({
  name: trimmed(200).min(1, 'is required'),
  issuer: trimmed(200).optional(),
  issuedDate: optionalDate,
  credentialId: trimmed(160).optional(),
  url: optionalHttpUrl,
});

export const resumeLanguageEntrySchema = z.object({
  name: trimmed(80).min(1, 'is required'),
  proficiency: trimmed(60).optional(),
});

export const resumeSkillSchema = z.object({
  name: trimmed(80).min(1, 'is required'),
  proficiency: trimmed(60).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
});

export const resumeContactSchema = z.object({
  email: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), 'must be an email address'),
  phone: trimmed(40).optional(),
  location: trimmed(160).optional(),
  linkedinUrl: optionalHttpUrl,
  githubUrl: optionalHttpUrl,
  portfolioUrl: optionalHttpUrl,
  websiteUrl: optionalHttpUrl,
});

export const resumeBasicsSchema = z.object({
  fullName: trimmed(160).min(1, 'is required'),
  headline: trimmed(200).optional(),
  /** Rendered verbatim in every template; never silently rewritten. */
  summary: trimmed(4000).optional(),
});

/** Section visibility and ordering, so the builder is not a fixed document. */
export const resumeSectionOrderSchema = z
  .array(
    z.enum([
      'summary',
      'experience',
      'education',
      'skills',
      'projects',
      'certifications',
      'languages',
    ])
  )
  .max(7);

export const resumeDocumentSchema = z.object({
  /** Bumped when the model changes shape, so old documents stay renderable. */
  schemaVersion: z.number().int().min(1).max(100).default(1),
  basics: resumeBasicsSchema,
  contact: resumeContactSchema.default({ email: '' }),
  experience: z.array(resumeExperienceSchema).max(30).default([]),
  education: z.array(resumeEducationSchema).max(20).default([]),
  skills: z.array(resumeSkillSchema).max(60).default([]),
  projects: z.array(resumeProjectSchema).max(20).default([]),
  certifications: z.array(resumeCertificationSchema).max(20).default([]),
  languages: z.array(resumeLanguageEntrySchema).max(20).default([]),
  sectionOrder: resumeSectionOrderSchema.optional(),
});

export type ResumeExperience = z.infer<typeof resumeExperienceSchema>;
export type ResumeEducation = z.infer<typeof resumeEducationSchema>;
export type ResumeProject = z.infer<typeof resumeProjectSchema>;
export type ResumeCertification = z.infer<typeof resumeCertificationSchema>;
export type ResumeSkill = z.infer<typeof resumeSkillSchema>;
export type ResumeLanguageEntry = z.infer<typeof resumeLanguageEntrySchema>;
export type ResumeBasics = z.infer<typeof resumeBasicsSchema>;
export type ResumeContact = z.infer<typeof resumeContactSchema>;
export type ResumeSection = z.infer<typeof resumeSectionOrderSchema>[number];
export type ResumeDocument = z.infer<typeof resumeDocumentSchema>;

export const RESUME_SECTIONS: readonly ResumeSection[] = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
];

export const SECTION_LABELS: Record<ResumeSection, string> = {
  summary: 'Professional summary',
  experience: 'Experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  languages: 'Languages',
};

/** Raised when submitted builder content cannot be parsed. */
export class ResumeContentError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'ResumeContentError';
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Parses untrusted builder content into a document the renderer can trust.
 *
 * Throws `ResumeContentError` with actionable messages rather than coercing bad
 * input into an empty document: a silently emptied resume is a worse outcome
 * than a rejected save, because the candidate would not know their work was
 * dropped until they opened the PDF.
 */
export function parseResumeDocument(input: unknown): ResumeDocument {
  const result = resumeDocumentSchema.safeParse(input ?? {});
  if (!result.success) {
    throw new ResumeContentError(formatIssues(result.error));
  }
  return result.data;
}

/** Non-throwing variant for read paths that must survive a legacy document. */
export function safeParseResumeDocument(input: unknown): ResumeDocument | null {
  const result = resumeDocumentSchema.safeParse(input ?? {});
  return result.success ? result.data : null;
}

/** An empty document, used when a candidate opens the builder for the first time. */
export function emptyResumeDocument(fullName: string, email = ''): ResumeDocument {
  return {
    schemaVersion: 1,
    basics: { fullName, headline: undefined, summary: undefined },
    contact: { email },
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    sectionOrder: [...RESUME_SECTIONS],
  };
}

/** The sections this document actually has content for, in render order. */
export function presentSections(document: ResumeDocument): ResumeSection[] {
  const has = (section: ResumeSection): boolean => {
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
  };

  const order = document.sectionOrder?.length ? document.sectionOrder : RESUME_SECTIONS;
  // A stored order is a preference, not a filter: a section is still rendered if
  // it has content even when the order omits it, so hiding a section can never
  // silently drop work the candidate entered.
  const known = order.filter(has);
  const missing = RESUME_SECTIONS.filter((section) => !order.includes(section) && has(section));
  return [...known, ...missing];
}

/** Rough completeness signal for the builder UI; not an entitlement check. */
export function resumeDocumentCompletion(document: ResumeDocument): number {
  const checks = [
    Boolean(document.basics.fullName.trim()),
    Boolean(document.basics.headline?.trim()),
    Boolean(document.basics.summary?.trim()),
    Boolean(document.contact.email.trim()),
    document.experience.length > 0,
    document.education.length > 0,
    document.skills.length >= 3,
    document.projects.length > 0,
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}
