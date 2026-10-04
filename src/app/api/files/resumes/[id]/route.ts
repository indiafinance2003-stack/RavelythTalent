import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { resolveStoredPath } from "@/lib/storage";
import { resumeDownloadAuthorised, resumeDownloadNotFound } from "@/lib/candidate/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * Authenticated resume download.
 *
 * Files live outside /public and are only readable through this route, which
 * verifies ownership before streaming a single byte. Recruiters get access
 * only through `resumeDownloadAuthorised`, which checks company membership and
 * the application's job.
 */
export async function GET(
  _request: Request,
  { params }: { params: Params },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthenticated", message: "Sign in to view resumes." } },
      { status: 401 },
    );
  }

  const { id } = await params;
  const resumeId = z.uuid().safeParse(id);
  if (!resumeId.success) {
    return NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Resume not found." } },
      { status: 404 },
    );
  }

  const access = await resumeDownloadAuthorised(resumeId.data, user.id, user.role);
  if (!access) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "not_found", message: "Resume not found." },
      },
      { status: 404 },
    );
  }

  try {
    const absolute = await resolveStoredPath(access.storagePath);
    const file = await fs.readFile(absolute);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": access.mimeType,
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(access.downloadName)}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("[files] resume read failed:", error);
    return NextResponse.json(resumeDownloadNotFound(), { status: 404 });
  }
}