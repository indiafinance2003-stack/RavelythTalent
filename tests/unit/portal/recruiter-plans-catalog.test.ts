import { describe, expect, it } from 'vitest';
import { RECRUITER_PLAN_SEED, normalizeJobPostAllowance, periodEndFrom } from '@/lib/portal/recruiter-plans/catalog';

/**
 * The recruiter plan catalogue is LOCKED COMMERCIAL PRICING.
 *
 * These amounts are what four plan cards, the checkout quote and every invoice
 * are derived from. A stray edit here silently changes what customers are
 * charged across the whole product, so the numbers are asserted literally
 * rather than derived from each other — a test that recomputes the expected
 * value from the code under test proves nothing.
 *
 * All amounts are integer minor units (paise). Floating point rupees would
 * introduce rounding drift into real charges.
 */
describe('locked recruiter plan pricing', () => {
  const EXPECTED = [
    { code: 'basic', name: 'Basic', priceMonthlyMinor: 399900, priceAnnualMinor: 3000000, jobPostsPerMonth: 5 },
    { code: 'professional', name: 'Professional', priceMonthlyMinor: 799900, priceAnnualMinor: 5000000, jobPostsPerMonth: 15 },
    { code: 'business', name: 'Business', priceMonthlyMinor: 1299900, priceAnnualMinor: 7000000, jobPostsPerMonth: 25 },
    { code: 'enterprise', name: 'Enterprise', priceMonthlyMinor: 3599900, priceAnnualMinor: 11500000, jobPostsPerMonth: 50 },
  ];

  it('has exactly the four advertised tiers', () => {
    expect(RECRUITER_PLAN_SEED.map((plan) => plan.code)).toEqual([
      'basic',
      'professional',
      'business',
      'enterprise',
    ]);
  });

  it.each(EXPECTED)(
    '$name is priced exactly as published',
    ({ code, name, priceMonthlyMinor, priceAnnualMinor, jobPostsPerMonth }) => {
      const plan = RECRUITER_PLAN_SEED.find((entry) => entry.code === code);
      expect(plan, `plan ${code} must exist`).toBeDefined();
      expect(plan!.name).toBe(name);
      expect(plan!.priceMonthlyMinor).toBe(priceMonthlyMinor);
      expect(plan!.priceAnnualMinor).toBe(priceAnnualMinor);
      expect(plan!.jobPostsPerMonth).toBe(jobPostsPerMonth);
    }
  );

  it('prices every plan as whole rupees, never fractional paise', () => {
    // A price that is not a multiple of 100 cannot be written as a clean rupee
    // figure and usually means someone typed rupees into a paise field.
    for (const plan of RECRUITER_PLAN_SEED) {
      expect(plan.priceMonthlyMinor % 100, `${plan.code} monthly`).toBe(0);
      expect(plan.priceAnnualMinor % 100, `${plan.code} annual`).toBe(0);
      expect(plan.jobPostsPerMonth).toBeGreaterThan(0);
    }
  });

  it('orders tiers by price and sort order together', () => {
    // A plan card ordering itself by price while the database orders by
    // sort_order would show tiers in a different sequence from the checkout
    // list, which reads as a pricing mistake to a customer.
    const sorted = [...RECRUITER_PLAN_SEED].sort((a, b) => a.priceMonthlyMinor - b.priceMonthlyMinor);
    expect(sorted.map((plan) => plan.sortOrder)).toEqual(
      [...sorted.map((plan) => plan.sortOrder)].sort((a, b) => a - b)
    );
  });

  it('only marks Enterprise as the enterprise tier', () => {
    expect(
      RECRUITER_PLAN_SEED.filter((plan) => plan.isEnterprise).map((plan) => plan.code)
    ).toEqual(['enterprise']);
  });

  it('gives every tier a strictly growing set of capabilities', () => {
    // Higher tiers must include everything lower tiers offer, otherwise a
    // downgrade would silently remove a capability a customer relies on.
    const [basic, professional, business, enterprise] = RECRUITER_PLAN_SEED;
    expect(professional!.features.length).toBeGreaterThan(basic!.features.length);
    expect(business!.features.length).toBeGreaterThan(professional!.features.length);
    expect(enterprise!.features.length).toBeGreaterThan(business!.features.length);
    for (const feature of basic!.features) {
      expect(professional!.features).toContain(feature);
    }
    for (const feature of professional!.features) {
      expect(business!.features).toContain(feature);
    }
  });
});

describe('allowance normalisation', () => {
  it('never reports zero or negative posts as usable', () => {
    // A stored 0 would otherwise mean "cannot post at all" while looking like
    // "unlimited" in a report.
    expect(normalizeJobPostAllowance(0)).toBe(1);
    expect(normalizeJobPostAllowance(-5)).toBe(1);
    expect(normalizeJobPostAllowance(null)).toBe(1);
    expect(normalizeJobPostAllowance(undefined)).toBe(1);
    expect(normalizeJobPostAllowance(Number.NaN)).toBe(1);
  });

  it('caps an absurd allowance so a typo cannot open unlimited posting', () => {
    expect(normalizeJobPostAllowance(10_000_000)).toBe(500);
  });

  it('passes a normal allowance through unchanged', () => {
    expect(normalizeJobPostAllowance(15)).toBe(15);
  });
});

describe('billing period arithmetic', () => {
  it('renews a monthly plan on the same day of the next month', () => {
    const end = periodEndFrom(new Date('2026-01-15T00:00:00Z'), 'monthly');
    expect(end.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('clamps 31 January rather than spilling into March', () => {
    // "31 Jan + 1 month" has no exact answer; silently landing on 2 or 3 March
    // would shorten the customer's paid period.
    const end = periodEndFrom(new Date('2026-01-31T00:00:00Z'), 'monthly');
    expect(end.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('adds a full year for an annual plan', () => {
    const end = periodEndFrom(new Date('2026-03-01T00:00:00Z'), 'annual');
    expect(end.toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });
});