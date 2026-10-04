/**
 * Recruiter plan capabilities.
 *
 * These keys are the CONTRACT between a plan row and the code that gates a
 * feature. A screen asks "does this company's plan include `resume_database`?"
 * and the answer comes from the database, which means marketing copy and actual
 * access can never drift apart: a capability is either granted on the plan or
 * it is not offered.
 *
 * This module is deliberately free of data access so route handlers, server
 * components and client components can all import it.
 */

export const RECRUITER_FEATURE_KEYS = [
  'job_posting',
  'company_profile',
  'applications',
  'candidate_management',
  'notifications',
  'advanced_candidate_search',
  'resume_database',
  'shortlisting',
  'saved_candidates',
  'interview_management',
  'reports',
  'team_management',
  'advanced_analytics',
  'priority_support',
] as const;

export type RecruiterFeatureKey = (typeof RECRUITER_FEATURE_KEYS)[number];

export interface RecruiterFeatureDefinition {
  key: RecruiterFeatureKey;
  label: string;
  /** What the capability actually lets a recruiter do. Shown on pricing cards. */
  description: string;
}

export const RECRUITER_PLAN_FEATURES: readonly RecruiterFeatureDefinition[] = [
  {
    key: 'job_posting',
    label: 'Job posting and management',
    description: 'Create, publish, edit and close vacancies within your monthly allowance.',
  },
  {
    key: 'company_profile',
    label: 'Company profile',
    description: 'A public company page that every posting links back to.',
  },
  {
    key: 'applications',
    label: 'Applications inbox',
    description: 'Every application in one place, with the resume the candidate actually submitted.',
  },
  {
    key: 'candidate_management',
    label: 'Candidate management',
    description: 'Move applicants through your pipeline and record the outcome of each step.',
  },
  {
    key: 'notifications',
    label: 'Notifications and email flows',
    description: 'In-app and email alerts when candidates apply or a posting is reviewed.',
  },
  {
    key: 'advanced_candidate_search',
    label: 'Advanced candidate search and filtering',
    description: 'Search the candidate pool by skill, experience, location and availability.',
  },
  {
    key: 'resume_database',
    label: 'Resume database',
    description: 'Read the resumes of candidates who have made their profile visible to employers.',
  },
  {
    key: 'shortlisting',
    label: 'Shortlisting',
    description: 'Shortlist applicants and track the status change on each application.',
  },
  {
    key: 'saved_candidates',
    label: 'Saved candidates',
    description: 'Keep a private shortlist of candidates with your team’s notes.',
  },
  {
    key: 'interview_management',
    label: 'Interview scheduling and management',
    description: 'Schedule, reschedule and cancel interviews; both sides see the same details.',
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'Posting, application and pipeline reporting for your own company.',
  },
  {
    key: 'team_management',
    label: 'Team and recruiter management',
    description: 'Add colleagues to the company account and give them a role.',
  },
  {
    key: 'advanced_analytics',
    label: 'Advanced analytics',
    description: 'Funnel conversion, time-to-shortlist and source breakdown across all postings.',
  },
  {
    key: 'priority_support',
    label: 'Priority support',
    description: 'Priority routing for support requests raised by your company.',
  },
];

export function isRecruiterFeatureKey(value: string): value is RecruiterFeatureKey {
  return (RECRUITER_FEATURE_KEYS as readonly string[]).includes(value);
}

export function recruiterFeatureLabel(key: string): string {
  return RECRUITER_PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key;
}
