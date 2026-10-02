import { describe, expect, it } from 'vitest';
import { sanitiseSocialUrl, socialLinksFrom } from '@/lib/social';

/**
 * Social link resolution.
 *
 * The rule under test is that the site can only ever link to a profile an
 * operator has explicitly configured, and only when that URL is a safe https
 * link on the expected host. Everything else must be OMITTED, because a
 * hard-coded or guessed handle produces a link to an account that may not
 * exist — which is worse than showing no link at all.
 */

const emptyConfig = {
  SOCIAL_X: '',
  SOCIAL_LINKEDIN: '',
  SOCIAL_GITHUB: '',
  SOCIAL_YOUTUBE: '',
  SOCIAL_INSTAGRAM: '',
  SOCIAL_FACEBOOK: '',
};

describe('social link validation', () => {
  it('accepts a well-formed https profile URL for its own network', () => {
    expect(sanitiseSocialUrl('x', 'https://x.com/ravelyth')).toBe('https://x.com/ravelyth');
    expect(sanitiseSocialUrl('github', 'https://github.com/ravelyth')).toBe(
      'https://github.com/ravelyth'
    );
    // Both accepted forms for the two networks that have more than one.
    expect(sanitiseSocialUrl('x', 'https://twitter.com/ravelyth')).toBe(
      'https://twitter.com/ravelyth'
    );
    expect(sanitiseSocialUrl('linkedin', 'https://www.linkedin.com/company/ravelyth')).toBe(
      'https://www.linkedin.com/company/ravelyth'
    );
  });

  it('rejects an unset or blank channel', () => {
    // The most important case: an unconfigured channel must yield no link.
    expect(sanitiseSocialUrl('x', undefined)).toBeNull();
    expect(sanitiseSocialUrl('x', '')).toBeNull();
    expect(sanitiseSocialUrl('x', '   ')).toBeNull();
  });

  it('rejects anything that is not https', () => {
    // A javascript: URL here would be a script-injection vector, and http is
    // both insecure and a broken link.
    expect(sanitiseSocialUrl('x', 'javascript:alert(1)')).toBeNull();
    expect(sanitiseSocialUrl('x', 'http://x.com/ravelyth')).toBeNull();
    expect(sanitiseSocialUrl('linkedin', 'mailto:someone@example.com')).toBeNull();
  });

  it('rejects a URL on the wrong host for the channel', () => {
    // A mis-set variable must fail closed rather than point the brand at
    // somebody else's account.
    expect(sanitiseSocialUrl('x', 'https://evil.example.com/ravelyth')).toBeNull();
    expect(sanitiseSocialUrl('github', 'https://gitlab.com/ravelyth')).toBeNull();
  });

  it('rejects a value that is not a URL at all', () => {
    expect(sanitiseSocialUrl('x', 'not a url')).toBeNull();
    expect(sanitiseSocialUrl('x', '/ravelyth')).toBeNull();
  });
});

describe('social link list', () => {
  it('is empty when nothing is configured', () => {
    // Correct-by-omission: the footer simply shows no social links.
    expect(socialLinksFrom(emptyConfig)).toEqual([]);
  });

  it('contains only the channels that were configured', () => {
    const links = socialLinksFrom({ ...emptyConfig, SOCIAL_X: 'https://x.com/ravelyth' });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ network: 'x', label: 'X' });
    expect(links[0].href).toBe('https://x.com/ravelyth');
  });

  it('drops an invalid channel while keeping the valid ones', () => {
    const links = socialLinksFrom({
      ...emptyConfig,
      SOCIAL_X: 'https://x.com/ravelyth',
      // Wrong host: must be dropped, not rendered.
      SOCIAL_GITHUB: 'https://github.com.evil.example/ravelyth',
      SOCIAL_LINKEDIN: 'not-a-url',
    });
    expect(links.map((link) => link.network)).toEqual(['x']);
  });

  it('emits a stable order regardless of which channels are set', () => {
    const links = socialLinksFrom({
      ...emptyConfig,
      SOCIAL_FACEBOOK: 'https://www.facebook.com/ravelyth',
      SOCIAL_X: 'https://x.com/ravelyth',
      SOCIAL_LINKEDIN: 'https://www.linkedin.com/company/ravelyth',
    });
    expect(links.map((link) => link.network)).toEqual(['x', 'linkedin', 'facebook']);
  });
});
