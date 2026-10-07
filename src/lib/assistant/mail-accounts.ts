import "server-only";
import { getEnv } from "@/lib/env";

export type InboxAccountId = "support" | "gmail";

export type MailAccountCredentials = {
  id: InboxAccountId;
  username: string;
  password: string;
  address: string;
  imap: {
    host: string;
    port: 993;
    secure: true;
  };
  smtp: {
    host: string;
    port: 587;
    secure: false;
    requireTLS: true;
  };
};

export type InboxAccountStatus = {
  id: InboxAccountId;
  address: string | null;
  configured: boolean;
};

function allowedAddress(address: string): boolean {
  return !/(?:^|[<\s])noreply@/i.test(address);
}

export function getMailAccountCredentials(): MailAccountCredentials[] {
  const env = getEnv();
  const accounts: MailAccountCredentials[] = [];

  if (
    env.INBOX_SUPPORT_USER &&
    env.INBOX_SUPPORT_PASS &&
    allowedAddress(env.INBOX_SUPPORT_USER) &&
    allowedAddress(env.INBOX_SUPPORT_ADDRESS ?? "support@ravelyth.in")
  ) {
    accounts.push({
      id: "support",
      username: env.INBOX_SUPPORT_USER,
      password: env.INBOX_SUPPORT_PASS,
      address: env.INBOX_SUPPORT_ADDRESS ?? "support@ravelyth.in",
      imap: { host: "mail.ravelyth.in", port: 993, secure: true },
      smtp: { host: "mail.ravelyth.in", port: 587, secure: false, requireTLS: true },
    });
  }

  if (
    env.INBOX_GMAIL_USER &&
    env.INBOX_GMAIL_APP_PASSWORD &&
    allowedAddress(env.INBOX_GMAIL_USER)
  ) {
    accounts.push({
      id: "gmail",
      username: env.INBOX_GMAIL_USER,
      password: env.INBOX_GMAIL_APP_PASSWORD,
      address: env.INBOX_GMAIL_USER,
      imap: { host: "imap.gmail.com", port: 993, secure: true },
      smtp: { host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true },
    });
  }

  return accounts;
}

export function getMailAccountStatuses(): InboxAccountStatus[] {
  const configured = new Map(
    getMailAccountCredentials().map((account) => [account.id, account.address]),
  );

  return (["support", "gmail"] as const).map((id) => ({
    id,
    address: configured.get(id) ?? null,
    configured: configured.has(id),
  }));
}
