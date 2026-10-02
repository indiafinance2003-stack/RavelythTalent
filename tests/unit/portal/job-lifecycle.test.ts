import { describe, expect, it } from 'vitest';
import {
  ADMIN_TRANSITIONS,
  applicationRejectionReason,
  assertTransition,
  canTransition,
  changedMaterialFields,
  EMPLOYER_TRANSITIONS,
  isAcceptingApplications,
} from '@/lib/portal/jobs/lifecycle';
import { AppError } from '@/lib/errors/app-error';

/**
 * Job lifecycle rules (test items 40-46).
 *
 * These are the rules that stop an employer from publishing a job directly, so
 * they are asserted exhaustively rather than by example.
 */
describe('job lifecycle transitions', () => {
  it('never lets an employer publish a job directly', () => {
    for (const from of Object.keys(EMPLOYER_TRANSITIONS)) {
      expect(canTransition(from, 'published', 'employer')).toBe(false);
    }
  });

  it('lets an employer submit a draft and withdraw a pending job', () => {
    expect(canTransition('draft', 'pending_approval', 'employer')).toBe(true);
    expect(canTransition('pending_approval', 'draft', 'employer')).toBe(true);
    expect(canTransition('rejected', 'pending_approval', 'employer')).toBe(true);
    expect(canTransition('rejected', 'draft', 'employer')).toBe(true);
    expect(canTransition('published', 'closed', 'employer')).toBe(true);
  });

  it('lets an admin approve or reject a pending job', () => {
    expect(canTransition('pending_approval', 'published', 'admin')).toBe(true);
    expect(canTransition('pending_approval', 'rejected', 'admin')).toBe(true);
  });

  it('treats closed and expired jobs as terminal', () => {
    for (const actor of ['employer', 'admin'] as const) {
      for (const target of Object.keys(ADMIN_TRANSITIONS)) {
        if (target === 'closed' || target === 'expired') {
          expect(canTransition('closed', target, actor)).toBe(false);
          expect(canTransition('expired', target, actor)).toBe(false);
        }
      }
    }
  });

  it('rejects unknown statuses', () => {
    expect(canTransition('made_up', 'published', 'admin')).toBe(false);
    expect(canTransition('draft', 'made_up', 'admin')).toBe(false);
  });

  it('throws a 409 with an actionable message when an employer self-publishes', () => {
    expect(() => assertTransition('pending_approval', 'published', 'employer')).toThrowError(
      /must be reviewed/i
    );
    try {
      assertTransition('pending_approval', 'published', 'employer');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
    }
  });

  it('throws a conflict for an illegal transition', () => {
    expect(() => assertTransition('closed', 'published', 'admin')).toThrowError(/cannot move/i);
  });
});

describe('application eligibility', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it('accepts applications for a live published job', () => {
    const job = { status: 'published', applicationDeadline: future, expiresAt: future };
    expect(isAcceptingApplications(job)).toBe(true);
    expect(applicationRejectionReason(job)).toBeNull();
  });

  it('rejects applications for a closed job', () => {
    const job = { status: 'closed', applicationDeadline: future, expiresAt: future };
    expect(isAcceptingApplications(job)).toBe(false);
    expect(applicationRejectionReason(job)).toMatch(/no longer accepting/i);
  });

  it('rejects applications once the deadline has passed', () => {
    const job = { status: 'published', applicationDeadline: past, expiresAt: future };
    expect(isAcceptingApplications(job)).toBe(false);
    expect(applicationRejectionReason(job)).toMatch(/deadline.*has passed/i);
  });

  it('rejects applications for an expired posting', () => {
    const job = { status: 'published', applicationDeadline: null, expiresAt: past };
    expect(isAcceptingApplications(job)).toBe(false);
    expect(applicationRejectionReason(job)).toMatch(/expired/i);
  });

  it('rejects applications for unpublished, draft and rejected jobs', () => {
    for (const status of ['draft', 'pending_approval', 'rejected', 'expired']) {
      const job = { status, applicationDeadline: future, expiresAt: future };
      expect(isAcceptingApplications(job)).toBe(false);
      expect(applicationRejectionReason(job)).not.toBeNull();
    }
  });
});

describe('material job changes', () => {
  it('detects a changed title, description and salary', () => {
    const before = { title: 'Backend Engineer', description: 'Build services', salaryMinMinor: 100 };
    const after = { title: 'Backend Engineer II', description: 'Build services', salaryMinMinor: 200 };
    expect(changedMaterialFields(before, after)).toEqual(['title', 'salaryMinMinor']);
  });

  it('ignores an unchanged or cosmetically different value', () => {
    const before = { title: 'Backend Engineer', skills: ['react', 'node'] };
    const after = { title: '  Backend Engineer  ', skills: ['node', 'react'] };
    expect(changedMaterialFields(before, after)).toEqual([]);
  });

  it('treats missing and empty-array values as equivalent', () => {
    expect(changedMaterialFields({ benefits: undefined }, { benefits: [] })).toEqual([]);
    expect(changedMaterialFields({ location: null }, { location: undefined })).toEqual([]);
  });

  it('detects a reordered skills list as unchanged but a changed one as material', () => {
    expect(changedMaterialFields({ skills: ['a', 'b'] }, { skills: ['b', 'a'] })).toEqual([]);
    expect(changedMaterialFields({ skills: ['a', 'b'] }, { skills: ['a', 'c'] })).toEqual(['skills']);
  });
});
