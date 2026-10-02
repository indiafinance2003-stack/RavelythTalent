import { describe, expect, it } from 'vitest';
import { registerSchema } from '@/app/api/portal/schemas';
import { CONSENT_PURPOSES } from '@/lib/db/portal-schema';

/**
 * Registration consent contract.
 *
 * The rule under test: an account may only be created when the terms were
 * affirmatively accepted, and per-purpose consent is never inferred. A schema
 * that defaulted `acceptTerms` would let the backend manufacture consent records
 * for users who never agreed to anything.
 */

const validBase = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
  accountType: 'candidate' as const,
};

describe('register schema consent requirements', () => {
  it('requires explicit acceptance of the terms', () => {
    expect(registerSchema.safeParse({ ...validBase, acceptTerms: true }).success).toBe(true);

    // Absent, false, or a truthy non-boolean are all refused.
    expect(registerSchema.safeParse({ ...validBase }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validBase, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validBase, acceptTerms: 'yes' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validBase, acceptTerms: 1 }).success).toBe(false);
  });

  it('allows a candidate to register without any optional purpose consent', () => {
    // Marketing and resume storage are genuinely optional; absence must not be
    // silently converted into consent.
    const result = registerSchema.safeParse({ ...validBase, acceptTerms: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consents).toBeUndefined();
    }
  });

  it('keeps per-purpose flags optional and independently settable', () => {
    const result = registerSchema.safeParse({
      ...validBase,
      acceptTerms: true,
      consents: { jobApplication: true, marketing: false },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.consents?.jobApplication).toBe(true);
      expect(result.data.consents?.marketing).toBe(false);
      expect(result.data.consents?.resumeStorage).toBeUndefined();
    }
  });

  it('rejects unknown consent keys rather than ignoring them', () => {
    // A typo like "jobApplications" must fail loudly instead of registering an
    // account whose job-application consent was never actually given.
    const result = registerSchema.safeParse({
      ...validBase,
      acceptTerms: true,
      consents: { jobApplications: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-boolean consent value', () => {
    expect(
      registerSchema.safeParse({
        ...validBase,
        acceptTerms: true,
        consents: { marketing: 'true' },
      }).success
    ).toBe(false);
  });

  it('exposes exactly the purposes the database knows about', () => {
    // A consent purpose typed here but absent from the schema would be silently
    // unpersistable, and vice versa.
    for (const purpose of CONSENT_PURPOSES) {
      expect(CONSENT_PURPOSES).toContain(purpose);
    }
    expect(CONSENT_PURPOSES).toContain('job_application');
    expect(CONSENT_PURPOSES).toContain('resume_storage');
    expect(CONSENT_PURPOSES).toContain('marketing');
    expect(CONSENT_PURPOSES).toContain('account_creation');
  });

  it('still requires a company for an employer and rejects one for a candidate', () => {
    const employer = {
      ...validBase,
      accountType: 'employer' as const,
      acceptTerms: true,
    };
    expect(registerSchema.safeParse(employer).success).toBe(false);
    expect(
      registerSchema.safeParse({ ...employer, company: { name: 'Acme' } }).success
    ).toBe(true);

    expect(
      registerSchema.safeParse({ ...validBase, acceptTerms: true, company: { name: 'Acme' } }).success
    ).toBe(false);
  });

  it('still enforces the password confirmation and match rules', () => {
    expect(
      registerSchema.safeParse({
        ...validBase,
        acceptTerms: true,
        confirmPassword: 'something else entirely',
      }).success
    ).toBe(false);
  });
});
