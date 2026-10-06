import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

export function adminFormErrorUrl(path: string, error: unknown): string | null {
  const message = error instanceof AppError && error.status < 500
    ? error.message
    : error instanceof ZodError
      ? error.issues[0]?.message ?? "Check the submitted values."
      : null;
  return message ? `${path}?adminError=${encodeURIComponent(message)}` : null;
}
