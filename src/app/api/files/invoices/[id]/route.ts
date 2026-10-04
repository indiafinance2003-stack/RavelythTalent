import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { resolveStoredPath } from "@/lib/storage";
import { findOwnedInvoice } from "@/lib/billing/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * Authenticated invoice PDF download.
 *
 * Invoices are owner-only (or visible to active members of the invoice's
 * company, and admins). Unauthorized access returns 404 so invoice ids cannot
 * be probed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Params },
): Promise<Response> {
  const notFound = () =>
    NextResponse.json(
      { ok: false, error: { code: "not_found", message: "Invoice not found." } },
      { status: 404 },
    );

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "unauthenticated", message: "Sign in to view invoices." },
      },
      { status: 401 },
    );
  }

  const { id } = await params;
  const invoiceId = z.uuid().safeParse(id);
  if (!invoiceId.success) return notFound();

  const invoice = await findOwnedInvoice(invoiceId.data, user.id, user.role);
  if (!invoice || !invoice.pdfPath) return notFound();

  try {
    const absolute = await resolveStoredPath(invoice.pdfPath);
    const file = await fs.readFile(absolute);
    const fileName = `${invoice.invoiceNumber.replace(/[^A-Za-z0-9]/g, "-")}.pdf`;
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
    console.error("[files] invoice read failed:", error);
    return notFound();
  }
}
