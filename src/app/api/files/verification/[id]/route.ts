import { and, eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companies, companyMembers, companyVerificationDocuments } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { resolveStoredPath, safeFileName } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) throw new AppError("Document not found.", 404, "not_found");
    const rows = await db
      .select({
        storagePath: companyVerificationDocuments.storagePath,
        originalName: companyVerificationDocuments.originalName,
        mimeType: companyVerificationDocuments.mimeType,
        companyId: companies.id,
      })
      .from(companyVerificationDocuments)
      .innerJoin(companies, eq(companies.id, companyVerificationDocuments.companyId))
      .where(eq(companyVerificationDocuments.id, parsedId.data))
      .limit(1);
    const document = rows.at(0);
    if (!document) throw new AppError("Document not found.", 404, "not_found");

    if (user.role !== "admin") {
      const membership = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, document.companyId),
            eq(companyMembers.userId, user.id),
            eq(companyMembers.status, "active"),
          ),
        )
        .limit(1);
      if (membership.length === 0) {
        throw new AppError("You cannot access this document.", 403, "forbidden");
      }
    }

    const bytes = await readFile(await resolveStoredPath(document.storagePath));
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${safeFileName(document.originalName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[files] verification document download failed:", error);
    return NextResponse.json({ error: "Could not download document." }, { status: 500 });
  }
}
