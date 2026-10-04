import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "@/lib/env";

let transporter: Transporter | null = null;

/**
 * SMTP transport.
 *
 * STARTTLS is mandatory on the submission port (587) - `requireTLS` is only
 * turned off when the owner explicitly sets `SMTP_SECURE=true` (port 465).
 */
export function getTransport(): Transporter {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = getEnv();
  const secure = Boolean(SMTP_SECURE);

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure,
    requireTLS: !secure,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    pool: true,
    maxConnections: 3,
    maxMessages: 200,
  });

  return transporter;
}

export function fromAddress(): string {
  return getEnv().EMAIL_FROM;
}

/** Used by the admin "send test email" action and the health checks. */
export async function verifyTransport(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}