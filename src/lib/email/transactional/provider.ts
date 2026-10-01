import 'server-only';
import { config } from '@/lib/config';
import type { EmailProvider } from './types';

/**
 * Registered transactional email providers.
 *
 * Every secret comes from the environment through `config` — no provider
 * carries baked-in credentials.
 *
 * The SMTP provider is imported LAZILY (inside `getEmailProvider` /
 * `emailProviderStatus`) rather than at module scope. A top-level import would
 * create a cycle — smtp.ts needs `registerEmailProvider` from this module — and
 * would pull nodemailer into every process that merely checks email status.
 *
 * To add another provider, import it the same way inside these two functions.
 */
const registeredProviders: Record<string, EmailProvider> = {};

/** Providers are loaded on first use to avoid an import cycle. */
let providersLoaded = false;

function loadProviders(): void {
  if (providersLoaded) return;
  providersLoaded = true;
  try {
    // Registers the 'smtp' provider on import.
    require('./smtp') as unknown;
  } catch {
    // A missing optional dependency must not break the whole application; the
    // provider simply stays unregistered and is reported as unsupported.
  }
}

export function registerEmailProvider(provider: EmailProvider): void {
  registeredProviders[provider.name] = provider;
}

/**
 * Resolves the configured provider, or null when EMAIL_PROVIDER is empty or
 * does not match a registered provider. Credentials are never exposed.
 */
export function getEmailProvider(): EmailProvider | null {
  if (!config.EMAIL_PROVIDER) return null;
  loadProviders();
  return registeredProviders[config.EMAIL_PROVIDER] ?? null;
}

export interface EmailProviderStatus {
  /** True only when a provider is selected AND registered. */
  configured: boolean;
  /** The raw EMAIL_PROVIDER value when set (safe to log; never a secret). */
  configuredProvider: string | null;
  /** True when a provider name is set but no matching implementation exists. */
  unsupported: boolean;
}

/**
 * Precise delivery-availability report used for honest operational logging.
 * `EMAIL_FROM` must also be present before delivery is possible.
 */
export function emailProviderStatus(): EmailProviderStatus {
  const providerName = config.EMAIL_PROVIDER;
  if (!providerName || !config.EMAIL_FROM) {
    return { configured: false, configuredProvider: providerName || null, unsupported: false };
  }
  loadProviders();
  const provider = registeredProviders[providerName];
  return {
    configured: provider !== undefined,
    configuredProvider: providerName,
    unsupported: provider === undefined,
  };
}