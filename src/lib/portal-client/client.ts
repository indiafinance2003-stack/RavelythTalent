'use client';

import { ApiRequestError, apiGet, apiPost } from '@/lib/client/api';

/**
 * Browser-side client for the Ravelyth Talent portal API.
 *
 * Everything here is a thin, typed wrapper over the real backend routes. There
 * is deliberately NO local "success" simulation: a helper resolves only when the
 * server said the operation succeeded, and rejects with the server's own error
 * message otherwise. That is what stops the UI showing a success state for
 * something that never happened.
 *
 * Auth is handled by the HttpOnly session cookie, so no token is ever held in
 * JavaScript and nothing here can be pointed at another user.
 */

/** Raised when the session is missing or has expired. Callers re-auth. */
export class UnauthorisedError extends ApiRequestError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/** Raised when the signed-in role may not perform the action. */
export class ForbiddenError extends ApiRequestError {
  constructor(message = 'You do not have permission to do that.') {
    super(message, 403, 'FORBIDDEN');
  }
}

/** Raised when consent has not been given. */
export class ConsentRequiredError extends ApiRequestError {
  constructor(message: string) {
    super(message, 403, 'FORBIDDEN');
  }
}

function normalise(error: unknown): never {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) throw new UnauthorisedError(error.message);
    if (error.status === 403) throw new ForbiddenError(error.message);
  }
  throw error;
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return normalise(error);
  }
}

/** GET with typed params, skipping undefined values so they are not sent. */
export async function portalGet<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> = {}
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const suffix = query.toString();
  return call(() => apiGet<T>(suffix ? `${path}?${suffix}` : path));
}

export async function portalPost<T>(path: string, body: unknown): Promise<T> {
  return call(() => apiPost<T>(path, body));
}

/** PUT / PATCH with a JSON body. */
export async function portalSend<T>(
  method: 'PUT' | 'PATCH' | 'POST',
  path: string,
  body: unknown
): Promise<T> {
  return call(async () => {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: { message: string; code?: string };
    };
    if (!payload.success) {
      throw new ApiRequestError(
        payload.error?.message ?? 'The request failed.',
        response.status,
        payload.error?.code
      );
    }
    return payload.data as T;
  });
}

/** DELETE, optionally with query parameters. */
export async function portalDelete<T>(
  path: string,
  params: Record<string, string | undefined> = {}
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return call(() => {
    const url = suffix ? `${path}?${suffix}` : path;
    return fetch(url, { method: 'DELETE' }).then(async (response) => {
      const payload = (await response.json()) as {
        success: boolean;
        data?: T;
        error?: { message: string; code?: string };
      };
      if (!payload.success) {
        throw new ApiRequestError(
          payload.error?.message ?? 'The request failed.',
          response.status,
          payload.error?.code
        );
      }
      return payload.data as T;
    });
  });
}

/**
 * Multipart upload for resume files.
 *
 * The Content-Type header is deliberately NOT set: the browser must add the
 * multipart boundary itself, and forcing a content type here produces a body
 * the server cannot parse.
 */
export async function portalUpload<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  return call(async () => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(extra ?? {})) form.append(key, value);

    const response = await fetch(path, { method: 'POST', body: form });
    const payload = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: { message: string; code?: string };
    };
    if (!payload.success) {
      throw new ApiRequestError(
        payload.error?.message ?? 'The upload failed.',
        response.status,
        payload.error?.code
      );
    }
    return payload.data as T;
  });
}

/**
 * Downloads a file through an authorised endpoint.
 *
 * Uses fetch rather than a plain link so the request carries the session cookie
 * and so a 404 (denied, or genuinely absent) surfaces as a readable message
 * instead of a browser download of an error page.
 */
export async function portalDownload(
  path: string,
  fallbackFilename: string
): Promise<void> {
  return call(async () => {
    const response = await fetch(path);
    if (!response.ok) {
      let message = 'The file could not be downloaded.';
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload?.error?.message) message = payload.error.message;
      } catch {
        // A non-JSON error body is not worth surfacing verbatim.
      }
      throw new ApiRequestError(message, response.status);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename="?([^"]+)"?/i.exec(disposition);
    const filename = match?.[1] ?? fallbackFilename;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return undefined;
  });
}
