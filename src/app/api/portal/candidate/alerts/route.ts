import { NextRequest } from 'next/server';
import { handleApi, readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';
import { z } from 'zod';
import { requireCandidateProfile } from '@/lib/portal/auth-context';
import {
  createJobAlert,
  deleteJobAlert,
  listJobAlerts,
  updateJobAlert,
} from '@/lib/portal/candidates/saved-jobs';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';

const alertSchema = z
  .object({
    name: z.string().min(1).max(120),
    keywords: z.string().max(200).nullish(),
    location: z.string().max(120).nullish(),
    skills: z.array(z.string().min(1).max(60)).max(20).optional(),
    experienceMinYears: z.number().int().min(0).max(70).nullish(),
    experienceMaxYears: z.number().int().min(0).max(70).nullish(),
    employmentType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'freelance']).nullish(),
    workMode: z.enum(['onsite', 'hybrid', 'remote']).nullish(),
    frequency: z.enum(['daily', 'weekly']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const updateSchema = alertSchema
  .partial()
  .extend({ alertId: z.string().uuid() })
  .refine((data) => data.alertId !== undefined, { message: 'alertId is required.' });

/**
 * GET    /api/portal/candidate/alerts - the caller's own alerts
 * POST   /api/portal/candidate/alerts - create an alert
 * PUT    /api/portal/candidate/alerts - update an alert
 * DELETE /api/portal/candidate/alerts?alertId=... - delete an alert
 *
 * An alert stores real criteria and is matched by a real database query.
 * DELIVERY is a scheduled-worker concern: nothing here claims an alert email
 * was sent, because nothing here sends one.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    return { items: await listJobAlerts(profile.id) };
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  return handleApi(
    req,
    async () => {
      const profile = await requireCandidateProfile();
      const body = await readJsonBody(req);
      const input = parseWithSchema(alertSchema, body);
      return { alert: await createJobAlert(profile.id, input) };
    },
    () => 201
  );
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const body = await readJsonBody(req);
    const { alertId, ...changes } = parseWithSchema(updateSchema, body);
    return { alert: await updateJobAlert(profile.id, alertId, changes) };
  });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const profile = await requireCandidateProfile();
    const alertId = req.nextUrl.searchParams.get('alertId') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(alertId)) {
      throw new AppError(AppErrorCode.VALIDATION_ERROR, 'A valid alertId is required.');
    }
    return { removed: await deleteJobAlert(profile.id, alertId) };
  });
}
