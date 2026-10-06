export const JOB_SCAN_THRESHOLDS = {
  // Scores under 35 publish; 35–69 require review; 70+ block.
  publishBelow: 35,
  holdBelow: 70,
} as const;

export type TextRule = {
  id: string;
  score: number;
  decision: "hold" | "block";
  reason: string;
  pattern: RegExp;
};

export const JOB_SCAN_TEXT_RULES: TextRule[] = [
  // Candidate charges are prohibited: block direct application/registration fees and deposits.
  {
    id: "candidate-payment",
    score: 100,
    decision: "block",
    reason: "The post appears to ask candidates to pay a fee, deposit, or other charge.",
    pattern: /\b(registration fee|security deposit|training fee|kit charges?|processing fee|pay to apply|pay to get (?:this|the) job|candidate.{0,20}(?:fee|payment))\b/i,
  },
  // Daily income promises tied to work-from-home are a common advance-fee scam signal.
  {
    id: "earn-per-day-from-home",
    score: 45,
    decision: "hold",
    reason: "The post makes an unusually specific daily-earnings claim for work from home.",
    pattern: /\b(?:earn|earning|income)\s+(?:₹?\s*)?(?:\d[\d,]*\s*)?(?:per day|a day|daily).{0,50}\b(?:from home|work from home|wfh)\b|\b(?:from home|work from home|wfh).{0,50}\b(?:earn|earning|income)\s+(?:₹?\s*)?\d[\d,]*\s*(?:per day|a day|daily)\b/i,
  },
  // Multi-level marketing and pyramid recruitment need manual review.
  {
    id: "mlm",
    score: 40,
    decision: "hold",
    reason: "The post contains multi-level marketing, pyramid, or recruitment-chain language.",
    pattern: /\b(mlm|multi[- ]level marketing|pyramid scheme|downline|build your network and earn|refer.{0,20}earn)\b/i,
  },
  // Crypto, trading, and investment opportunity posts are not ordinary jobs by default.
  {
    id: "crypto-investment",
    score: 35,
    decision: "hold",
    reason: "The post promotes cryptocurrency, trading, or investment returns.",
    pattern: /\b(cryptocurrency|crypto token|bitcoin investment|forex trading|investment opportunity|guaranteed returns|double your money|trading signals)\b/i,
  },
  // Explicit sexual services or pornographic solicitation is prohibited.
  {
    id: "adult-content",
    score: 100,
    decision: "block",
    reason: "The post contains adult or sexually explicit recruitment content.",
    pattern: /\b(porn(?:ography)?|escort services?|adult entertainment model|explicit photos?|sexual services?)\b/i,
  },
  // Hiring must not exclude or prefer applicants on protected personal attributes.
  {
    id: "discriminatory-wording",
    score: 100,
    decision: "block",
    reason: "The post appears to discriminate based on gender, religion, caste, age, or marital status.",
    pattern: /\b(male candidates? only|female candidates? only|men only|women only|no (?:married|marriage) applicants|below \d{2} years only|above \d{2} years only|only [a-z]+ caste|hindu candidates? only|muslim candidates? only)\b/i,
  },
  // Personal contact is an added risk only when another suspicious signal is also present.
  {
    id: "personal-contact",
    score: 25,
    decision: "hold",
    reason: "The post directs applicants to a personal messaging number or free-mail address alongside other risk signals.",
    pattern: /\b(whats?app|telegram|@(?:gmail|yahoo|outlook|hotmail|rediffmail)\.com)\b/i,
  },
];

export const JOB_SCAN_LINK_LIMIT = 5;
// Short descriptions are held to ensure employers supply enough role context.
export const JOB_SCAN_MIN_WORDS = 60;
// Salary above ₹10 crore/year for less than three years' experience is held.
export const JOB_SCAN_SUSPICIOUS_ANNUAL_PAise = 10_000_000_000;
