import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '@/lib/config';
import { registerEmailProvider } from './provider';
import type { EmailProvider, EmailSendInput } from './types';

/**
 * SMTP transactional email provider.
 *
 * Registered (but inert) by default: it is only ever selected when
 * EMAIL_PROVIDER=smtp AND a host is configured. Credentials come exclusively
 * from the environment — nothing is hard-coded here.
 *
 * The transporter is created lazily and cached, because nodemailer pools
 * connections and creating one per request would be wasteful.
 */

let transporter: Transporter | undefined;

function buildTransporter(): Transporter {
  if (transporter) return transporter;

  const port = config.SMTP_PORT;
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port,
    // Port 465 is implicit TLS; everything else starts in plaintext and is
    // upgraded with STARTTLS.
    secure: port === 465,
    requireTLS: config.SMTP_REQUIRE_TLS && port !== 465,
    ignoreTLS: !config.SMTP_REQUIRE_TLS && port !== 465,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
      : undefined,
    // A misconfigured certificate must not silently downgrade to insecure.
    tls: { rejectUnauthorized: true },
    connectionTimeout: config.SMTP_TIMEOUT_MS,
    greetingTimeout: config.SMTP_TIMEOUT_MS,
    socketTimeout: config.SMTP_TIMEOUT_MS,
  });

  return transporter;
}

export const smtpEmailProvider: EmailProvider = {
  name: 'smtp',

  async send(input: EmailSendInput): Promise<void> {
    if (!config.SMTP_HOST) {
      throw new Error('SMTP_HOST is not configured.');
    }
    await buildTransporter().sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  },
};

// Registering makes EMAIL_PROVIDER=smtp resolvable. Until SMTP_HOST is set,
// send() refuses, so a half-configured environment never silently "succeeds".
registerEmailProvider(smtpEmailProvider);
