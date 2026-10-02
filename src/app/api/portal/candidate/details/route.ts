import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApi, parseSearchParams, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  addAchievement,
  addCertification,
  addEducation,
  addExperience,
  addProject,
  listAchievements,
  listCertifications,
  listEducation,
  listExperience,
  listLanguages,
  listProjects,
  listSkills,
  removeAchievement,
  removeCertification,
  removeEducation,
  removeExperience,
  removeLanguage,
  removeProject,
  removeSkill,
  upsertLanguage,
  upsertSkill,
} from '@/lib/portal/candidates/details';

/**
 * The candidate's structured profile sections.
 *
 * One route handles all of them because they share the same ownership rule: the
 * candidate id is resolved from the SESSION inside `requireCandidateProfile`,
 * so there is no way to address another candidate's rows. Every remove is scoped
 * by `candidateId` in the service too, so a guessed id deletes nothing.
 *
 * `type` selects the section. It is a closed set, so an unknown value is a 400
 * rather than a silently ignored request.
 */

const proficiency = z.enum(['beginner', 'intermediate', 'advanced', 'expert', 'professional']);

const skillSchema = z.object({
  type: z.literal('skill'),
  name: z.string().min(1).max(60),
  proficiency: proficiency.optional(),
  yearsOfExperience: z.number().int().min(0).max(70).nullish(),
}).strict();

const languageSchema = z.object({
  type: z.literal('language'),
  name: z.string().min(1).max(60),
  proficiency: proficiency.optional(),
}).strict();

const educationSchema = z.object({
  type: z.literal('education'),
  institution: z.string().min(1).max(160),
  degree: z.string().max(120).nullish(),
  fieldOfStudy: z.string().max(120).nullish(),
  startYear: z.number().int().min(1900).max(2100).nullish(),
  endYear: z.number().int().min(1900).max(2100).nullish(),
  grade: z.string().max(40).nullish(),
  description: z.string().max(2000).nullish(),
}).strict();

const experienceSchema = z.object({
  type: z.literal('experience'),
  company: z.string().min(1).max(120),
  title: z.string().min(1).max(120),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']).optional(),
  location: z.string().max(120).nullish(),
  startDate: z.string().max(30).nullish(),
  endDate: z.string().max(30).nullish(),
  isCurrent: z.boolean().optional(),
  description: z.string().max(3000).nullish(),
}).strict();

const projectSchema = z.object({
  type: z.literal('project'),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  url: z.string().max(300).nullish(),
  technologies: z.array(z.string().min(1).max(60)).max(25).optional(),
  startDate: z.string().max(30).nullish(),
  endDate: z.string().max(30).nullish(),
}).strict();

const certificationSchema = z.object({
  type: z.literal('certification'),
  name: z.string().min(1).max(160),
  issuer: z.string().max(120).nullish(),
  issuedOn: z.string().max(30).nullish(),
  expiresOn: z.string().max(30).nullish(),
  credentialId: z.string().max(120).nullish(),
  url: z.string().max(300).nullish(),
}).strict();

const achievementSchema = z.object({
  type: z.literal('achievement'),
  title: z.string().min(1).max(160),
  description: z.string().max(1000).nullish(),
  achievedOn: z.string().max(30).nullish(),
}).strict();

const addSchema = z.discriminatedUnion('type', [
  skillSchema,
  languageSchema,
  educationSchema,
  experienceSchema,
  projectSchema,
  certificationSchema,
  achievementSchema,
]);

const REMOVABLE = [
  'skill',
  'language',
  'education',
  'experience',
  'project',
  'certification',
  'achievement',
] as const;
type Section = (typeof REMOVABLE)[number];

function assertSection(value: string): asserts value is Section {
  if (!(REMOVABLE as readonly string[]).includes(value)) {
    throw new Error(`type must be one of: ${REMOVABLE.join(', ')}.`);
  }
}

/** GET /api/portal/candidate/details - every structured section at once */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const id = profile.id;

    return {
      skills: await listSkills(id),
      languages: await listLanguages(id),
      education: await listEducation(id),
      experience: await listExperience(id),
      projects: await listProjects(id),
      certifications: await listCertifications(id),
      achievements: await listAchievements(id),
    };
  });
}

/** POST /api/portal/candidate/details - add one record to a section */
export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const input = parseWithSchema(addSchema, await readJsonBody(req));
      const id = profile.id;

      // `input.type` narrows the discriminated union. Destructuring `type` out
      // first would erase that narrowing, so each branch passes the whole input.
      switch (input.type) {
        case 'skill':
          return { record: await upsertSkill(id, input) };
        case 'language':
          return { record: await upsertLanguage(id, input) };
        case 'education':
          return { record: await addEducation(id, input) };
        case 'experience':
          return { record: await addExperience(id, input) };
        case 'project':
          return { record: await addProject(id, input) };
        case 'certification':
          return { record: await addCertification(id, input) };
        case 'achievement':
          return { record: await addAchievement(id, input) };
        default:
          throw new Error('Unsupported section.');
      }
    },
    () => 201
  );
}

/** DELETE /api/portal/candidate/details?type=skill&id=... */
export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const params = parseSearchParams(req);

    const id = params.id ?? '';
    if (!id) throw new Error('An id is required.');

    const section = params.type ?? '';
    assertSection(section);

    // Each remover is already scoped to the caller's candidate id, so a guessed
    // id removes nothing and reports the honest outcome.
    let removed: boolean;
    switch (section) {
      case 'skill':
        removed = await removeSkill(profile.id, id);
        break;
      case 'language':
        removed = await removeLanguage(profile.id, id);
        break;
      case 'education':
        removed = await removeEducation(profile.id, id);
        break;
      case 'experience':
        removed = await removeExperience(profile.id, id);
        break;
      case 'project':
        removed = await removeProject(profile.id, id);
        break;
      case 'certification':
        removed = await removeCertification(profile.id, id);
        break;
      case 'achievement':
        removed = await removeAchievement(profile.id, id);
        break;
    }

    return { removed };
  });
}