/**
 * Official Ravelyth Talent social profiles.
 *
 * WHY THIS EXISTS AS A SEPARATE MODULE
 *
 * Social links are a common source of quietly wrong URLs: a hard-coded handle
 * that no longer exists, or a guess at a company page. This resolver is the only
 * place the site turns configuration into links, and it will only emit a link
 * that an operator has explicitly supplied AND that passes validation. An
 * unconfigured channel is omitted entirely rather than rendered as a dead or
 * invented address, so the footer is correct-by-omission until real accounts
 * are configured.
 *
 * Every URL is validated before use:
 *  - it must parse as a URL,
 *  - the scheme must be https (a plaintext or javascript: link in a footer is
 *    both a security problem and a broken link),
 *  - the host must be the exact expected domain for that channel, so a typo or
 *    a mis-set variable cannot silently point the brand at somebody else's
 *    account.
 */

import { config } from '@/lib/config';

export type SocialNetwork = 'x' | 'linkedin' | 'github' | 'youtube' | 'instagram' | 'facebook';

export interface SocialLink {
  network: SocialNetwork;
  label: string;
  href: string;
}

/**
 * The one host each channel is allowed to point at.
 *
 * LinkedIn and YouTube have several legitimate host forms, so those are lists;
 * the rest are single hosts because a profile lives at exactly one.
 */
const ALLOWED_HOSTS: Record<SocialNetwork, readonly string[]> = {
  x: ['twitter.com', 'x.com'],
  linkedin: ['linkedin.com', 'www.linkedin.com'],
  github: ['github.com', 'www.github.com'],
  youtube: ['youtube.com', 'www.youtube.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  facebook: ['facebook.com', 'www.facebook.com'],
};

const LABELS: Record<SocialNetwork, string> = {
  x: 'X',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  youtube: 'YouTube',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

/**
 * Returns the URL only if it is a safe, on-brand https link for this channel.
 * Anything else is rejected and treated as "not configured" — a misconfigured
 * variable should fail closed, not render a suspicious link.
 */
export function sanitiseSocialUrl(network: SocialNetwork, raw: string | undefined): string | null {
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // A relative value, or anything not https, is not a social profile link.
  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS[network].includes(host)) return null;

  // Normalised back to a string so a value like "https://x.com/ravelyth/../foo"
  // cannot smuggle a different path past a consumer that re-parses it.
  return parsed.toString();
}

/**
 * Builds the link list from a configuration object shaped like `config`.
 *
 * Order is fixed here rather than derived from the environment, so the footer
 * renders in a stable order regardless of which variables happen to be set.
 */
export function socialLinksFrom(source: {
  SOCIAL_X: string;
  SOCIAL_LINKEDIN: string;
  SOCIAL_GITHUB: string;
  SOCIAL_YOUTUBE: string;
  SOCIAL_INSTAGRAM: string;
  SOCIAL_FACEBOOK: string;
}): SocialLink[] {
  const raw: Record<SocialNetwork, string> = {
    x: source.SOCIAL_X,
    linkedin: source.SOCIAL_LINKEDIN,
    github: source.SOCIAL_GITHUB,
    youtube: source.SOCIAL_YOUTUBE,
    instagram: source.SOCIAL_INSTAGRAM,
    facebook: source.SOCIAL_FACEBOOK,
  };

  const order: SocialNetwork[] = ['x', 'linkedin', 'github', 'youtube', 'instagram', 'facebook'];

  return order.flatMap((network) => {
    const href = sanitiseSocialUrl(network, raw[network]);
    return href ? [{ network, label: LABELS[network], href }] : [];
  });
}

/** The configured links, resolved from the app config. Empty when none are set. */
export function configuredSocialLinks(): SocialLink[] {
  return socialLinksFrom(config);
}
