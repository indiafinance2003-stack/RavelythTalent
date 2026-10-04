import fs from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { builtResumeVersions, builtResumes } from "@/lib/db/schema";
import { candidateResumeBuilderAccess } from "@/lib/candidate/builder";
import { resolveStoredPath } from "@/lib/storage";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthenticated", message: "Sign in to download this resume." } },
      { status: 401 },
    );
  }
  if (user.role !== "job_seeker") return notFound();

  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return notFound();
  const requestedVersion = new URL(request.url).searchParams.get("version");
  const parsedVersion = requestedVersion === null
    ? undefined
    : z.coerce.number().int().positive().safeParse(requestedVersion);
  if (parsedVersion && !parsedVersion.success) return notFound();

  const access = await candidateResumeBuilderAccess(user.id);
  if (!access.premium) {
    return NextResponse.json(
      { ok: false, error: { code: "feature_not_in_plan", message: "PDF downloads require Career Pro." } },
      { status: 403 },
    );
  }

  const rows = await db
    .select({
      title: builtResumes.title,
      version: builtResumeVersions.version,
      pdfPath: builtResumeVersions.pdfPath,
    })
    .from(builtResumes)
    .innerJoin(
      builtResumeVersions,
      and(
        eq(builtResumeVersions.builtResumeId, builtResumes.id),
        eq(
          builtResumeVersions.version,
          parsedVersion?.data ?? builtResumes.currentVersion,
        ),
      ),
    )
    .where(
      and(
        eq(builtResumes.id, parsedId.data),
        eq(builtResumes.userId, user.id),
        isNull(builtResumes.deletedAt),
      ),
    )
    .limit(1);
  const resume = rows[0];
  if (!resume?.pdfPath) return notFound();

  try {
    const file = await fs.readFile(await resolveStoredPath(resume.pdfPath));
    const filename = resume.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "resume";
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
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
    console.error("[files] built resume read failed:", error);
    return notFound();
  }
}

function notFound() {
  return NextResponse.json(
    { ok: false, error: { code: "not_found", message: "Resume not found." } },
    { status: 404 },
  );
}
