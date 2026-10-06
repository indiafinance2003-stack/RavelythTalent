/**
 * Static, non-fabricated seed data: plan catalogue, India-focused job
 * categories, a skills vocabulary, add-on definitions (inactive, no prices)
 * and brand defaults for site_settings.
 *
 * No company, job or user data lives here - see scripts/seed-demo.ts.
 */

export type PlanFeatureSeed = {
  featureKey: string;
  label: string;
  isEnabled: boolean;
  limitValue: number | null;
};

export type PlanSeed = {
  code: string;
  name: string;
  audience: "candidate" | "employer";
  description: string;
  priceMonthlyPaise: number;
  priceYearlyPaise: number;
  jobPostsPerMonth: number | null;
  isFeatured?: boolean;
  sortOrder: number;
  features: PlanFeatureSeed[];
};

const f = (
  featureKey: string,
  label: string,
  limitValue: number | null = null,
  isEnabled = true,
): PlanFeatureSeed => ({ featureKey, label, isEnabled, limitValue });

export const PLAN_SEED: PlanSeed[] = [
  {
    code: "candidate_free",
    name: "Free",
    audience: "candidate",
    description:
      "Everything a job seeker needs to apply: profile, resume upload, saved jobs, applications and job alerts.",
    priceMonthlyPaise: 0,
    priceYearlyPaise: 0,
    jobPostsPerMonth: null,
    sortOrder: 10,
    features: [
      f("apply_to_jobs", "Unlimited job applications"),
      f("resume_upload", "Resume upload"),
      f("saved_jobs", "Save jobs"),
      f("application_tracking", "Application tracking"),
      f("job_alerts", "Job alerts", 3),
      f("resume_database_visibility", "Appear in recruiter resume database"),
      f("resume_builder", "Premium resume builder", 0, false),
      f("resume_templates", "Resume templates", 1),
      f("resume_versions", "Saved resume versions", 1),
      f("priority_support", "Priority support", 0, false),
    ],
  },
  {
    code: "candidate_paid",
    name: "Career Pro",
    audience: "candidate",
    description:
      "Unlock the premium Resume Builder with professional templates, unlimited versions, PDF downloads and full history.",
    priceMonthlyPaise: 49900,
    priceYearlyPaise: 299900,
    jobPostsPerMonth: null,
    isFeatured: true,
    sortOrder: 20,
    features: [
      f("apply_to_jobs", "Unlimited job applications"),
      f("resume_upload", "Resume upload"),
      f("saved_jobs", "Save jobs"),
      f("application_tracking", "Application tracking"),
      f("job_alerts", "Job alerts", null),
      f("resume_database_visibility", "Appear in recruiter resume database"),
      f("resume_builder", "Premium resume builder"),
      f("resume_templates", "Resume templates", null),
      f("resume_versions", "Saved resume versions", null),
      f("priority_support", "Priority email support"),
    ],
  },
  {
    code: "employer_basic",
    name: "Basic",
    audience: "employer",
    description:
      "Core company, job posting and applicant management tools for small hiring teams.",
    priceMonthlyPaise: 399900,
    priceYearlyPaise: 3000000,
    jobPostsPerMonth: 5,
    sortOrder: 10,
    features: [
      f("job_posts_per_month", "Job posts per month", 5),
      f("applicant_management", "Applicant management pipeline"),
      f("company_page", "Public company page"),
      f("company_verification", "Company verification"),
      f("bulk_actions", "Bulk applicant actions"),
      f("candidate_search", "Candidate search", 0, false),
      f("resume_database", "Resume database", 0, false),
      f("saved_candidates", "Saved candidates", 0, false),
      f("shortlisting", "Shortlisting", 0, false),
      f("interview_management", "Interview management", 0, false),
      f("team_management", "Team management", 0, false),
      f("reports_basic", "Job view and application reports"),
      f("reports_enhanced", "Enhanced reports", 0, false),
      f("reports_advanced", "Advanced analytics", 0, false),
      f("priority_support", "Priority support", 0, false),
    ],
  },
  {
    code: "employer_free",
    name: "Free",
    audience: "employer",
    description: "One lifetime job post per company to get started.",
    priceMonthlyPaise: 0,
    priceYearlyPaise: 0,
    jobPostsPerMonth: null,
    sortOrder: 5,
    features: [
      f("job_posts_per_month", "One lifetime job post", 1),
      f("applicant_management", "Applicant management pipeline"),
      f("company_page", "Public company page"),
      f("company_verification", "Company verification"),
    ],
  },
  {
    code: "employer_professional",
    name: "Professional",
    audience: "employer",
    description:
      "Everything in Basic plus candidate search, the resume database, saved candidates, shortlisting and interviews.",
    priceMonthlyPaise: 799900,
    priceYearlyPaise: 5000000,
    jobPostsPerMonth: 15,
    sortOrder: 20,
    features: [
      f("job_posts_per_month", "Job posts per month", 15),
      f("applicant_management", "Applicant management pipeline"),
      f("company_page", "Public company page"),
      f("company_verification", "Company verification"),
      f("bulk_actions", "Bulk applicant actions"),
      f("candidate_search", "Advanced candidate search"),
      f("resume_database", "Resume database"),
      f("saved_candidates", "Saved candidates"),
      f("shortlisting", "Shortlisting"),
      f("interview_management", "Interview management"),
      f("reports_basic", "Job view and application reports"),
      f("reports_enhanced", "Enhanced reports"),
      f("team_management", "Team management", 0, false),
      f("reports_advanced", "Advanced analytics", 0, false),
      f("priority_support", "Priority support", 0, false),
    ],
  },
  {
    code: "employer_business",
    name: "Business",
    audience: "employer",
    description:
      "Everything in Professional plus team and recruiter management with per-member activity and advanced analytics.",
    priceMonthlyPaise: 1299900,
    priceYearlyPaise: 7000000,
    jobPostsPerMonth: 25,
    isFeatured: true,
    sortOrder: 30,
    features: [
      f("job_posts_per_month", "Job posts per month", 25),
      f("applicant_management", "Applicant management pipeline"),
      f("company_page", "Public company page"),
      f("company_verification", "Company verification"),
      f("bulk_actions", "Bulk applicant actions"),
      f("candidate_search", "Advanced candidate search"),
      f("resume_database", "Resume database"),
      f("saved_candidates", "Saved candidates"),
      f("shortlisting", "Shortlisting"),
      f("interview_management", "Interview management"),
      f("reports_basic", "Job view and application reports"),
      f("reports_enhanced", "Enhanced reports"),
      f("reports_advanced", "Advanced analytics"),
      f("team_management", "Team and recruiter management"),
      f("priority_support", "Priority support", 0, false),
    ],
  },
  {
    code: "employer_enterprise",
    name: "Enterprise",
    audience: "employer",
    description:
      "Full enterprise recruitment operations, advanced analytics, team management and priority support.",
    priceMonthlyPaise: 3599900,
    priceYearlyPaise: 11500000,
    jobPostsPerMonth: 50,
    sortOrder: 40,
    features: [
      f("job_posts_per_month", "Job posts per month", 50),
      f("applicant_management", "Applicant management pipeline"),
      f("company_page", "Public company page"),
      f("company_verification", "Company verification"),
      f("bulk_actions", "Bulk applicant actions"),
      f("candidate_search", "Advanced candidate search"),
      f("resume_database", "Resume database"),
      f("saved_candidates", "Saved candidates"),
      f("shortlisting", "Shortlisting"),
      f("interview_management", "Interview management"),
      f("reports_basic", "Job view and application reports"),
      f("reports_enhanced", "Enhanced reports"),
      f("reports_advanced", "Advanced analytics"),
      f("team_management", "Team and recruiter management"),
      f("priority_support", "Priority support"),
    ],
  },
];

/** The candidate launch offer: ₹1,999 per year. Admin can activate/deactivate. */
export const PLAN_PROMOTION_SEED = {
  code: "candidate_launch_1999",
  planCode: "candidate_paid",
  label: "Launch offer - Career Pro for one year",
  pricePaise: 199900,
  billingPeriod: "yearly" as const,
  bannerText: "Launch offer: Career Pro at \u20B91,999/year (limited period)",
  isActive: true,
};

export const CATEGORY_SEED: string[] = [
  "IT & Software",
  "Sales & Business Development",
  "Marketing & Advertising",
  "Finance & Accounting",
  "Banking & Insurance",
  "HR & Recruitment",
  "Operations & Supply Chain",
  "Customer Support & BPO",
  "Healthcare & Pharma",
  "Education & Training",
  "Engineering & Manufacturing",
  "Construction & Real Estate",
  "Design & Creative",
  "Legal & Compliance",
  "Hospitality & Travel",
  "Retail & E-commerce",
  "Media & Content",
  "Administration & Office",
  "Logistics & Transport",
  "Data Science & Analytics",
];

/** Domain vocabulary only - not company or job data. */
export const SKILL_SEED: Array<{ name: string; category: string }> = [
  { name: "JavaScript", category: "IT & Software" },
  { name: "TypeScript", category: "IT & Software" },
  { name: "React", category: "IT & Software" },
  { name: "Next.js", category: "IT & Software" },
  { name: "Node.js", category: "IT & Software" },
  { name: "Java", category: "IT & Software" },
  { name: "Python", category: "IT & Software" },
  { name: "SQL", category: "IT & Software" },
  { name: "PostgreSQL", category: "IT & Software" },
  { name: "AWS", category: "IT & Software" },
  { name: "Docker", category: "IT & Software" },
  { name: "Kubernetes", category: "IT & Software" },
  { name: "Spring Boot", category: "IT & Software" },
  { name: ".NET", category: "IT & Software" },
  { name: "Android", category: "IT & Software" },
  { name: "iOS", category: "IT & Software" },
  { name: "Flutter", category: "IT & Software" },
  { name: "Data Analysis", category: "Data Science & Analytics" },
  { name: "Power BI", category: "Data Science & Analytics" },
  { name: "Tableau", category: "Data Science & Analytics" },
  { name: "Machine Learning", category: "Data Science & Analytics" },
  { name: "Digital Marketing", category: "Marketing & Advertising" },
  { name: "SEO", category: "Marketing & Advertising" },
  { name: "Content Writing", category: "Media & Content" },
  { name: "Tally", category: "Finance & Accounting" },
  { name: "GST Filing", category: "Finance & Accounting" },
  { name: "Financial Analysis", category: "Finance & Accounting" },
  { name: "Inside Sales", category: "Sales & Business Development" },
  { name: "Business Development", category: "Sales & Business Development" },
  { name: "Customer Support", category: "Customer Support & BPO" },
  { name: "Recruitment", category: "HR & Recruitment" },
  { name: "Payroll", category: "HR & Recruitment" },
  { name: "Supply Chain Management", category: "Operations & Supply Chain" },
  { name: "Inventory Management", category: "Operations & Supply Chain" },
  { name: "AutoCAD", category: "Engineering & Manufacturing" },
  { name: "Mechanical Design", category: "Engineering & Manufacturing" },
  { name: "Civil Engineering", category: "Construction & Real Estate" },
  { name: "Quality Assurance", category: "Engineering & Manufacturing" },
  { name: "Clinical Research", category: "Healthcare & Pharma" },
  { name: "Nursing", category: "Healthcare & Pharma" },
  { name: "Teaching", category: "Education & Training" },
  { name: "UI/UX Design", category: "Design & Creative" },
  { name: "Graphic Design", category: "Design & Creative" },
  { name: "Legal Drafting", category: "Legal & Compliance" },
  { name: "Hospitality Management", category: "Hospitality & Travel" },
  { name: "Retail Operations", category: "Retail & E-commerce" },
  { name: "Logistics Coordination", category: "Logistics & Transport" },
  { name: "MS Excel", category: "Administration & Office" },
  { name: "Communication Skills", category: "Administration & Office" },
];

/**
 * Configurable add-ons. All are seeded INACTIVE with NO price - an admin must
 * set the price and activate each one before it can be purchased.
 */
export const ADDON_SEED: Array<{
  code: string;
  name: string;
  description: string;
  type: "per_job" | "per_company" | "subscription";
  durationDays: number;
  sortOrder: number;
}> = [
  {
    code: "featured_job",
    name: "Featured Job",
    description:
      "Highlight a single job at the top of search results and on the home page for the configured duration.",
    type: "per_job",
    durationDays: 30,
    sortOrder: 10,
  },
  {
    code: "urgent_hiring",
    name: "Urgent Hiring badge",
    description:
      "Add an Urgent Hiring badge to a job to increase click-through from the search listing.",
    type: "per_job",
    durationDays: 30,
    sortOrder: 20,
  },
  {
    code: "job_boost",
    name: "Job Boost",
    description:
      "Boost a job into the boosted placement slots and across the job-alert emails.",
    type: "per_job",
    durationDays: 15,
    sortOrder: 30,
  },
];
