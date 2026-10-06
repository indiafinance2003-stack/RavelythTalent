import {
  composeEmail,
  type EmailBlock,
  type EmailBrand,
  type EmailOptions,
} from "../layout";
import { appUrl, type RenderedEmail } from "../urls";

function render(options: EmailOptions): RenderedEmail {
  const { subject, html, text } = composeEmail(options);
  return { subject, html, text };
}

/* -------------------------------------------------------------------------- */
/* Company verification                                                       */
/* -------------------------------------------------------------------------- */

export function companyVerificationSubmittedEmail(params: {
  ownerName: string;
  companyName: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `We are reviewing ${params.companyName}`,
    preheader: "Your company verification is in the queue.",
    heading: "Verification submitted",
    intro: `Hi ${params.ownerName}, thank you. We have received the verification documents for ${params.companyName}.`,
    blocks: [
      {
        type: "paragraph",
        text: "Our team reviews every company manually, usually within 1-2 working days. We will email you as soon as a decision is made.",
      },
      {
        type: "note",
        text: "You can complete your company profile while you wait. Posting jobs unlocks right after approval.",
      },
    ],
    cta: { label: "Complete my company profile", url: appUrl("/recruiter/company") },
    brand: params.brand,
  });
}

export function companyVerificationApprovedEmail(params: {
  ownerName: string;
  companyName: string;
  planName?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  const blocks: EmailBlock[] = [
    {
      type: "paragraph",
      text: `${params.companyName} has been verified. Your company page is now public and you can post jobs for your candidates.`,
    },
  ];

  if (params.planName) {
    blocks.push({
      type: "note",
      text: `Your active plan is ${params.planName}. Job-post quotas are counted per calendar month and reset on the 1st.`,
    });
  }

  return render({
    subject: `${params.companyName} is verified on Ravelyth Talent`,
    preheader: "You can start posting jobs.",
    heading: "Company verified",
    intro: `Hi ${params.ownerName}, good news.`,
    blocks,
    cta: { label: "Post a job", url: appUrl("/recruiter/jobs/new") },
    secondaryCta: { label: "Open recruiter dashboard", url: appUrl("/recruiter") },
    brand: params.brand,
  });
}

export function companyVerificationRejectedEmail(params: {
  ownerName: string;
  companyName: string;
  reason: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Action needed on your ${params.companyName} verification`,
    preheader: "We could not verify your company yet.",
    heading: "Verification could not be completed",
    intro: `Hi ${params.ownerName}, we reviewed the documents submitted for ${params.companyName} and need a change before we can approve it.`,
    blocks: [
      { type: "note", text: `Reviewer note: ${params.reason}` },
      {
        type: "paragraph",
        text: "Upload a clearer or more recent document, then submit for review again. Job posting stays locked until the company is approved.",
      },
    ],
    cta: { label: "Fix and resubmit", url: appUrl("/recruiter/company/verification") },
    brand: params.brand,
  });
}

export function companySuspendedEmail(params: {
  ownerName: string;
  companyName: string;
  reason: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `${params.companyName} has been suspended`,
    preheader: "Company features are temporarily unavailable.",
    heading: "Company account suspended",
    intro: `Hi ${params.ownerName}, access for ${params.companyName} has been suspended by the Ravelyth Talent team.`,
    blocks: [
      { type: "note", text: `Reason: ${params.reason}` },
      { type: "paragraph", text: "Your public job listings are hidden while the suspension is active. Contact support if you believe this is an error." },
    ],
    cta: { label: "Contact support", url: appUrl("/contact") },
    brand: params.brand,
  });
}

export function companyRestoredEmail(params: {
  ownerName: string;
  companyName: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `${params.companyName} is active again`,
    preheader: "Company access has been restored.",
    heading: "Company account restored",
    intro: `Hi ${params.ownerName}, access for ${params.companyName} has been restored.`,
    blocks: [{ type: "paragraph", text: "Your company can manage its profile and approved job postings again." }],
    cta: { label: "Open recruiter dashboard", url: appUrl("/recruiter") },
    brand: params.brand,
  });
}

export function teamInvitationEmail(params: {
  companyName: string;
  role: string;
  inviteUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Invitation to join ${params.companyName} on Ravelyth Talent`,
    preheader: "A company team invited you to collaborate.",
    heading: "Join a hiring team",
    intro: `You have been invited to join ${params.companyName} as a ${params.role}.`,
    blocks: [
      { type: "paragraph", text: "Sign in or create a verified recruiter account with this email address, then accept the invitation within 7 days." },
    ],
    cta: { label: "Accept invitation", url: params.inviteUrl },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Job moderation                                                             */
/* -------------------------------------------------------------------------- */

export function jobApprovedEmail(params: {
  recruiterName: string;
  jobTitle: string;
  jobUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `"${params.jobTitle}" is now live`,
    preheader: "Your job posting has been approved.",
    heading: "Job approved and published",
    intro: `Hi ${params.recruiterName}, your "${params.jobTitle}" posting passed review and is now live on Ravelyth Talent.`,
    blocks: [
      {
        type: "paragraph",
        text: "Qualified candidates can now discover, save and apply to this role. We will notify you as applications arrive.",
      },
    ],
    cta: { label: "View the live job", url: params.jobUrl },
    secondaryCta: {
      label: "See applicants",
      url: appUrl("/recruiter/applications"),
    },
    brand: params.brand,
  });
}

export function jobRejectedEmail(params: {
  recruiterName: string;
  jobTitle: string;
  reason: string;
  editUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `"${params.jobTitle}" needs changes before publishing`,
    preheader: "A moderator left feedback on your job posting.",
    heading: "Job posting needs changes",
    intro: `Hi ${params.recruiterName}, a moderator reviewed "${params.jobTitle}" and it cannot go live yet.`,
    blocks: [
      { type: "note", text: `Moderator note: ${params.reason}` },
      {
        type: "paragraph",
        text: "Update the posting and submit it again. Job-post quota is only consumed by postings that pass review.",
      },
    ],
    cta: { label: "Edit and resubmit", url: params.editUrl },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Applicant notifications - recruiter side                                   */
/* -------------------------------------------------------------------------- */

export function applicationReceivedEmail(params: {
  recruiterName: string;
  candidateName: string;
  jobTitle: string;
  candidateUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `New application: ${params.candidateName} - ${params.jobTitle}`,
    preheader: "A new candidate applied to your job.",
    heading: "You have a new applicant",
    intro: `Hi ${params.recruiterName}, ${params.candidateName} applied for the ${params.jobTitle} role.`,
    blocks: [
      {
        type: "paragraph",
        text: "Review the profile and resume from your applicant pipeline, then move them to shortlisted or reject with a reason.",
      },
    ],
    cta: { label: "Review applicant", url: params.candidateUrl },
    secondaryCta: {
      label: "All applications",
      url: appUrl("/recruiter/applications"),
    },
    brand: params.brand,
  });
}

export function candidateShortlistedEmail(params: {
  recruiterName: string;
  candidateName: string;
  jobTitle: string;
  candidateUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `${params.candidateName} shortlisted for ${params.jobTitle}`,
    preheader: "A candidate moved to the shortlist.",
    heading: "Candidate shortlisted",
    intro: `Hi ${params.recruiterName}, ${params.candidateName} has been added to the shortlist for ${params.jobTitle}.`,
    blocks: [
      {
        type: "paragraph",
        text: "The candidate has been notified by email. Schedule an interview from the pipeline when you are ready.",
      },
    ],
    cta: { label: "Open pipeline", url: params.candidateUrl },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Job post quota                                                             */
/* -------------------------------------------------------------------------- */

export function jobPostLimitWarningEmail(params: {
  companyName: string;
  used: number;
  limit: number;
  periodLabel: string;
  planName?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  const percent = Math.round((params.used / Math.max(1, params.limit)) * 100);
  return render({
    subject: `You have used ${percent}% of your job-post quota`,
    preheader: `Job-post quota almost exhausted for ${params.companyName}.`,
    heading: "Job-post quota almost used up",
    intro: `${params.companyName} has used ${params.used} of ${params.limit} job posts in ${params.periodLabel}.`,
    blocks: [
      {
        type: "note",
        text: "New postings are blocked once the quota is reached. Upgrade your plan or wait for the quota to reset next month.",
      },
    ],
    cta: { label: "Upgrade my plan", url: appUrl("/pricing?audience=employer") },
    secondaryCta: {
      label: "View my jobs",
      url: appUrl("/recruiter/jobs"),
    },
    brand: params.brand,
  });
}

export function jobPostLimitReachedEmail(params: {
  companyName: string;
  limit: number;
  periodLabel: string;
  upgradeUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Job-post limit reached - upgrade to keep hiring",
    preheader: "You cannot submit new job posts on your current plan.",
    heading: "Job-post limit reached",
    intro: `${params.companyName} has used all ${params.limit} job posts included in your plan for ${params.periodLabel}.`,
    blocks: [
      {
        type: "paragraph",
        text: "Existing jobs stay live and applicants keep flowing in. Upgrade to publish new roles immediately, or wait for the quota to reset.",
      },
    ],
    cta: { label: "Upgrade my plan", url: params.upgradeUrl },
    secondaryCta: {
      label: "Manage add-ons",
      url: appUrl("/recruiter/add-ons"),
    },
    brand: params.brand,
  });
}

export function freeJobCreditWarningEmail(params: {
  companyName: string;
  used: number;
  limit: number;
  upgradeUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Your free job-post credit is nearly used",
    preheader: "Plan ahead for your next job posting.",
    heading: "Free job-post credit update",
    intro: `${params.companyName} has used ${params.used} of ${params.limit} lifetime free job posts.`,
    blocks: [
      {
        type: "paragraph",
        text: "Your free job-post allowance is shared by everyone in your company and does not reset monthly. Choose an employer plan when you need to post more roles.",
      },
    ],
    cta: { label: "Compare employer plans", url: params.upgradeUrl },
    brand: params.brand,
  });
}

export function freeJobCreditLimitReachedEmail(params: {
  companyName: string;
  limit: number;
  upgradeUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: "Your free job-post allowance is used",
    preheader: "Upgrade to post another role.",
    heading: "Free job-post allowance used",
    intro: `${params.companyName} has used all ${params.limit} lifetime free job posts.`,
    blocks: [
      {
        type: "paragraph",
        text: "Your existing jobs remain available as before. An active paid employer plan is required to submit another job.",
      },
    ],
    cta: { label: "Upgrade to an employer plan", url: params.upgradeUrl },
    brand: params.brand,
  });
}

export function addonPurchaseEmail(params: {
  ownerName: string;
  addonName: string;
  amount: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `${params.addonName} is now active`,
    preheader: "Your add-on purchase is complete.",
    heading: "Add-on activated",
    intro: `Hi ${params.ownerName}, ${params.addonName} is active on your account.`,
    blocks: [
      { type: "detail", rows: [{ label: "Amount paid", value: params.amount }] },
    ],
    cta: { label: "Manage my jobs", url: appUrl("/recruiter/jobs") },
    brand: params.brand,
  });
}