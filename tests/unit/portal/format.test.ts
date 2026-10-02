import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatExperienceBand,
  formatMoney,
  formatRelative,
  formatSalaryBand,
  minorToInput,
  parseMoneyToMinor,
  titleCase,
  VERIFICATION_LABELS,
} from '@/lib/portal-client/format';

/**
 * Portal display helpers.
 *
 * The rule under test is that money is converted in exactly one place. Every
 * amount on the portal is stored as integer MINOR units, and these helpers are
 * the only thing that divides by 100. A component that formatted a number
 * itself could easily send "₹9,900" to an endpoint expecting 990000, so the
 * conversion is pinned here rather than trusted to each call site.
 */
describe('money formatting and minor-unit conversion', () => {
  it('renders minor units as a rupee amount', () => {
    expect(formatMoney(990000)).toContain('9,900');
    expect(formatMoney(100)).toContain('1');
    // A zero amount is a real value, not a missing one.
    expect(formatMoney(0)).not.toBe('Not disclosed');
  });

  it('treats a null or undefined amount as undisclosed rather than zero', () => {
    // The distinction matters: a candidate reading "₹0" would conclude the role
    // pays nothing, when in fact the employer never disclosed a band.
    expect(formatMoney(null)).toBe('Not disclosed');
    expect(formatMoney(undefined)).toBe('Not disclosed');
  });

  it('round-trips an amount through the editable input form', () => {
    for (const minor of [0, 1, 99, 100, 12345, 990000, 1234567]) {
      const text = minorToInput(minor);
      expect(parseMoneyToMinor(text)).toBe(minor);
    }
  });

  it('parses user-typed amounts, ignoring symbols and separators', () => {
    // An admin typing "₹9,900" must not produce 990000 paise, nor fail outright.
    expect(parseMoneyToMinor('₹9,900')).toBe(990000);
    expect(parseMoneyToMinor('1,99,999')).toBe(19999900);
    expect(parseMoneyToMinor('  250  ')).toBe(25000);
    expect(parseMoneyToMinor('19.99')).toBe(1999);
  });

  it('returns null for input that is not a usable amount', () => {
    // null forces the caller to show a validation error. Returning 0 instead
    // would let a typo silently re-price a package at nothing.
    expect(parseMoneyToMinor('')).toBeNull();
    expect(parseMoneyToMinor('   ')).toBeNull();
    expect(parseMoneyToMinor('abc')).toBeNull();
    expect(parseMoneyToMinor('-50')).toBeNull();
  });

  it('renders an editable field as blank for a missing amount', () => {
    expect(minorToInput(null)).toBe('');
    expect(minorToInput(undefined)).toBe('');
  });
});

describe('salary bands', () => {
  it('says so plainly when the employer kept the band private', () => {
    // A private band must not be rendered as a range. Showing a real range that
    // the employer marked private would disclose salary they withheld.
    expect(formatSalaryBand(500000, 900000, false)).toBe('Salary not disclosed');
    expect(formatSalaryBand(500000, 900000, true)).toContain('–');
  });

  it('treats an absent band as undisclosed even when marked public', () => {
    expect(formatSalaryBand(null, null, true)).toBe('Salary not disclosed');
  });

  it('renders open-ended bands in the direction they were given', () => {
    expect(formatSalaryBand(500000, null, true)).toMatch(/^From/);
    expect(formatSalaryBand(null, 900000, true)).toMatch(/^Up to/);
  });
});

describe('experience bands', () => {
  it('returns null when the employer left the band blank', () => {
    // null lets the caller omit the row entirely, which is honest: a blank
    // band is not the same as a 0-0 band.
    expect(formatExperienceBand(null, null)).toBeNull();
  });

  it('renders closed, open-ended and upper-only bands differently', () => {
    expect(formatExperienceBand(3, 6)).toMatch(/3 – 6/);
    expect(formatExperienceBand(2, null)).toMatch(/^2\+/);
    expect(formatExperienceBand(null, 8)).toMatch(/^Up to 8/);
  });
});

describe('dates', () => {
  it('renders a placeholder for a missing or unparseable date', () => {
    // A broken date must not render "Invalid Date" into the UI.
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('nonsense')).toBe('—');
  });

  it('formats a valid date rather than the placeholder', () => {
    expect(formatDate('2024-03-05T00:00:00.000Z')).not.toBe('—');
  });

  it('returns an empty string for a missing relative time', () => {
    // The callers render this inline, so blank is correct and a dash would
    // suggest the event never happened.
    expect(formatRelative(null)).toBe('');
    expect(formatRelative('garbage')).toBe('');
  });

  it('describes very recent timestamps as "just now"', () => {
    const recent = new Date(Date.now() - 5_000).toISOString();
    expect(formatRelative(recent)).toBe('just now');
  });
});

describe('labels', () => {
  it('title-cases snake_case identifiers for display', () => {
    expect(titleCase('pending_approval')).toBe('Pending Approval');
    expect(titleCase('employer')).toBe('Employer');
  });

  it('has a human label for every company verification state', () => {
    // An unmapped status would render the raw enum value to an employer, which
    // is meaningless to them.
    for (const status of ['pending', 'verified', 'rejected', 'suspended']) {
      expect(VERIFICATION_LABELS[status]).toBeTruthy();
    }
  });
});
