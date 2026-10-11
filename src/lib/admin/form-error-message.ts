import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

export function adminFormErrorUrl(path: string, error: unknown): string | null {
  const message = error instanceof AppError && error.status < 500
    ? error.message
    : error instanceof ZodError
      ? error.issues[0]?.message ?? "Check the submitted values."
      : null;
  if (!message) return null;
  // Preserve any existing query string (for example `?edit=<id>`) so a failed
  // form submission never drops the page context the admin is working in.
  const [rawPath, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("adminError", message);
  // URLSearchParams serializes spaces as "+"; keep the historical "%20" form so
  // existing callers and tests that match the encoded URL keep working. A
  // literal "+" in a value is emitted as "%2B", so this rewrite is unambiguous.
  return `${rawPath}?${params.toString().replace(/\+/g, "%20")}`;
}
