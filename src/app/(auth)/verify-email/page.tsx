import type { Metadata } from "next";
import { VerifyEmailPanel } from "./verify-email-panel";

export const metadata: Metadata = {
  title: "Verify your email",
  robots: { index: false, follow: true },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ticketRaw = params.ticket;
  const errorRaw = params.error;
  const ticket = Array.isArray(ticketRaw) ? (ticketRaw[0] ?? "") : (ticketRaw ?? "");
  const error = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;

  return <VerifyEmailPanel ticket={ticket} error={error} />;
}