import { createHmac } from "node:crypto";
import { z } from "zod";
import { constantTimeEqual } from "@/lib/auth/crypto";

const payloadSchema = z.object({
  email: z.email(),
  expiresAt: z.number().int().positive(),
});

function signature(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function signUnsubscribeToken(
  email: string,
  secret: string,
  expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000,
): string {
  const payload = payloadSchema.parse({
    email: email.toLocaleLowerCase("en"),
    expiresAt: Math.floor(expiresAt / 1000),
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = Date.now(),
): { email: string; expiresAt: number } | null {
  const [encoded, provided, extra] = token.split(".");
  if (!encoded || !provided || extra !== undefined) return null;
  if (!constantTimeEqual(provided, signature(encoded, secret))) return null;
  try {
    const payload = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    if (!payload.success || payload.data.expiresAt * 1000 <= now) return null;
    return payload.data;
  } catch {
    return null;
  }
}
