import { NextRequest } from 'next/server';
import { handleApi, parseSearchParams } from '@/lib/errors/api-handler';
import { requireAdminUser } from '@/lib/portal/auth-context';
import { listUsersForAdmin, suspendUser, reinstateUser, changeUserRole } from '@/lib/portal/admin/users';
import { AppError, AppErrorCode } from '@/lib/errors/app-error';
import { z } from 'zod';
import { readJsonBody } from '@/lib/errors/api-handler';
import { parseWithSchema } from '@/lib/validation/parse';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().min(1).max(500) }),
  z.object({ action: z.literal('reinstate') }),
  z.object({
    action: z.literal('set_role'),
    // The closed assignable set: admin/owner/staff can never be granted here.
    role: z.enum(['candidate', 'employer', 'customer']),
  }),
]);

/**
 * GET  /api/portal/admin/users - paginated user list
 * PUT  /api/portal/admin/users?userId=... - suspend / reinstate / change role
 *
 * The target user id is a QUERY PARAMETER, but the acting admin is always the
 * session. The assignable role set has no admin value, so this endpoint cannot
 * be used to escalate anyone.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    await requireAdminUser();
    const params = parseSearchParams(req);
    return listUsersForAdmin({
      role: params.role,
      accountStatus: params.status,
      limit: Math.min(Math.max(Number.parseInt(params.limit ?? '20', 10) || 20, 1), 100),
      offset: Math.max(Number.parseInt(params.offset ?? '0', 10) || 0, 0),
    });
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  return handleApi(req, async () => {
    const admin = await requireAdminUser();
    const params = parseSearchParams(req);
    const body = await readJsonBody(req);
    const input = parseWithSchema(actionSchema, body);

    const userId = params.userId ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new AppError(AppErrorCode.VALIDATION_ERROR, 'A valid userId is required.');
    }

    // An admin cannot suspend or demote themselves through this endpoint.
    if (userId === admin.id && input.action !== 'set_role') {
      throw new AppError(
        AppErrorCode.CONFLICT,
        'You cannot suspend or reinstate your own account.',
        409
      );
    }

    if (input.action === 'suspend') {
      return { user: await suspendUser({ userId, adminUserId: admin.id, reason: input.reason }) };
    }
    if (input.action === 'reinstate') {
      return { user: await reinstateUser({ userId, adminUserId: admin.id }) };
    }
    return { user: await changeUserRole({ userId, role: input.role, adminUserId: admin.id }) };
  });
}
