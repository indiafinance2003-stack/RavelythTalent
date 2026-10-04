import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";
import { resolveStoredPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const settings = await getSiteSettings();
  if (!settings.featureBlog) return notFound();
  const { slug } = await params;
  const rows = await db
    .select({ coverImagePath: blogPosts.coverImagePath })
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);
  const coverPath = rows[0]?.coverImagePath;
  if (!coverPath) return notFound();
  const mimeType = MIME_BY_EXTENSION[path.extname(coverPath).toLowerCase()];
  if (!mimeType) return notFound();

  try {
    const file = await fs.readFile(await resolveStoredPath(coverPath));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[files] blog cover read failed:", error);
    return notFound();
  }
}

function notFound() {
  return NextResponse.json(
    { ok: false, error: { code: "not_found", message: "Cover image not found." } },
    { status: 404 },
  );
}
