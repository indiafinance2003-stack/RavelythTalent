import { readToken, signToken } from "./signed-token";

/**
 * Short-lived signed "email ticket".
 *
 * Unverified accounts cannot log in, so after registration we cannot identify
 * them by session. Instead we hand the browser an HMAC-signed ticket that
 * proves "this email address was just registered here". It expires in 24h.
 *
 * The ticket only authorises re-sending a verification email to that address
 * (an idempotent, rate-limited operation) - it grants no account access.
 */

const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

type TicketPayload = { e?: string; exp?: number };

export function createEmailTicket(email: string): string {
  return signToken({ e: email.trim().toLowerCase() }, TICKET_TTL_MS);
}

export function readEmailTicket(ticket: string | null | undefined): string | null {
  return readToken<TicketPayload>(ticket)?.e ?? null;
}
