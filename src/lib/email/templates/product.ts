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

const MODE_LABEL: Record<string, string> = {
  video: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

/* -------------------------------------------------------------------------- */
/* Applications - candidate side                                              */
/* -------------------------------------------------------------------------- */

export function applicationSubmittedEmail(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  jobUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  return render({
    subject: `Application sent: ${params.jobTitle} at ${params.companyName}`,
    preheader: "Your application is on its way.",
    heading: "Application submitted",
    intro: `Hi ${params.candidateName}, we have sent your application to ${params.companyName}.`,
    blocks: [
      {
        type: "detail",
        rows: [
          { label: "Role", value: params.jobTitle },
          { label: "Company", value: params.companyName },
        ],
      },
      {
        type: "paragraph",
        text: "Track the status of every application from your dashboard. The employer is notified and will contact you if you are shortlisted.",
      },
    ],
    cta: { label: "Track my application", url: appUrl("/dashboard/applications") },
    secondaryCta: { label: "View the job", url: params.jobUrl },
    brand: params.brand,
  });
}

export function applicationStatusChangeEmail(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  statusLabel: string;
  note?: string | null;
  jobUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const positive = ["shortlisted", "interview", "offered", "hired"];
  const isPositive = positive.includes(params.statusLabel.toLowerCase());

  const blocks: EmailBlock[] = [
    {
      type: "detail",
      rows: [
        { label: "Role", value: params.jobTitle },
        { label: "Company", value: params.companyName },
        { label: "Status", value: params.statusLabel },
      ],
    },
  ];

  if (params.note) {
    blocks.push({
      type: "quote",
      text: `Message from ${params.companyName}: ${params.note}`,
    });
  }

  blocks.push({
    type: "paragraph",
    text: isPositive
      ? "Great news - the hiring team has moved your application forward. Watch your inbox and dashboard for the next steps."
      : "The hiring team has updated your application. You can keep applying to other roles in the meantime.",
  });

  return render({
    subject: `Application update: ${params.statusLabel} - ${params.jobTitle}`,
    preheader: `${params.jobTitle} at ${params.companyName} is now ${params.statusLabel}.`,
    heading: `Application status: ${params.statusLabel}`,
    intro: `Hi ${params.candidateName}, there is an update on your application at ${params.companyName}.`,
    blocks,
    cta: { label: "View application", url: appUrl("/dashboard/applications") },
    secondaryCta: { label: "Browse more jobs", url: appUrl("/jobs") },
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Interviews                                                                 */
/* -------------------------------------------------------------------------- */

export function interviewScheduledEmail(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  mode: string;
  scheduledAt: string;
  durationMinutes?: number | null;
  meetingLink?: string | null;
  location?: string | null;
  notes?: string | null;
  confirmUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const isLocation = !params.meetingLink && Boolean(params.location);
  const where = params.meetingLink ?? params.location ?? "Will be shared";

  const rows = [
    { label: "Role", value: params.jobTitle },
    { label: "Company", value: params.companyName },
    { label: "Mode", value: MODE_LABEL[params.mode] ?? params.mode },
    { label: "Date & time", value: params.scheduledAt },
  ];
  if (params.durationMinutes) {
    rows.push({ label: "Duration", value: `${params.durationMinutes} minutes` });
  }
  rows.push({ label: isLocation ? "Location" : "Joining link", value: where });

  const blocks: EmailBlock[] = [{ type: "detail", rows }];
  if (params.notes) {
    blocks.push({ type: "paragraph", text: `What to expect: ${params.notes}` });
  }

  return render({
    subject: `Interview invitation: ${params.jobTitle} at ${params.companyName}`,
    preheader: `${params.scheduledAt} - ${MODE_LABEL[params.mode] ?? params.mode}`,
    heading: "You have an interview invitation",
    intro: `Hi ${params.candidateName}, ${params.companyName} would like to interview you for the ${params.jobTitle} role.`,
    blocks,
    cta: { label: "Confirm this interview", url: params.confirmUrl },
    footerNote:
      "Please confirm so the hiring team knows to expect you. You can reschedule from your dashboard.",
    brand: params.brand,
  });
}

/* -------------------------------------------------------------------------- */
/* Job alerts                                                                 */
/* -------------------------------------------------------------------------- */

export type AlertJob = {
  title: string;
  companyName: string;
  city?: string | null;
  url: string;
};

export function jobAlertEmail(params: {
  candidateName: string;
  alertName: string;
  frequency: "daily" | "weekly";
  jobs: AlertJob[];
  searchUrl: string;
  manageUrl: string;
  unsubscribeUrl: string;
  brand?: EmailBrand;
}): RenderedEmail {
  const lines = params.jobs.slice(0, 15).map((j) => {
    const place = j.city ? ` (${j.city})` : "";
    return `${j.title} - ${j.companyName}${place}`;
  });

  return render({
    subject: `${params.jobs.length} new job${params.jobs.length === 1 ? "" : "s"} matching "${params.alertName}"`,
    preheader: `Your ${params.frequency} job alert on Ravelyth Talent.`,
    heading: `New jobs matching "${params.alertName}"`,
    intro: `Hi ${params.candidateName}, here are the newest jobs that match your saved search.`,
    blocks: [
      { type: "paragraph", text: `You receive this ${params.frequency} because this alert is active.` },
      { type: "bullets", items: lines.length > 0 ? lines : ["No new matching jobs yet."] },
    ],
    cta: { label: "Search all matching jobs", url: params.searchUrl },
    secondaryCta: { label: "Manage job alerts", url: params.manageUrl },
    unsubscribeUrl: params.unsubscribeUrl,
    footerNote:
      "Change the frequency or turn this alert off at any time from your dashboard.",
    brand: params.brand,
  });
}