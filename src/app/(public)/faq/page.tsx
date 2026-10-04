import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about job applications, employer approvals, plans, and payments.",
};

const FAQs = [
  {
    question: "How do I apply for a job?",
    answer: "Create and verify a candidate account, complete the application form on a job listing, and track updates from your candidate dashboard.",
  },
  {
    question: "When will an employer see my application?",
    answer: "Applications are sent to the hiring company. The employer manages its pipeline and may update your application status or contact you about an interview.",
  },
  {
    question: "Why does a company need approval before posting jobs?",
    answer: "Company verification and job moderation help keep listings accountable. Submitted companies and jobs are reviewed before jobs are published.",
  },
  {
    question: "Do subscriptions renew automatically?",
    answer: "No. Plans are period-based and do not automatically debit a renewal. To continue after a period expires, complete a new payment order.",
  },
  {
    question: "How do I get help with a payment?",
    answer: "Use the Contact page and include the account email and payment or invoice reference. Do not send passwords, OTPs, or full card details.",
  },
  {
    question: "Can recruiters search every candidate profile?",
    answer: "No. Candidate database search is limited by plan entitlements and candidates must opt in to being discoverable. Application resumes follow separate job-application access rules.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-10 sm:px-6">
      <PageHeader title="Frequently asked questions" description="Helpful details for candidates and employers." />
      {FAQs.map((item) => (
        <Card key={item.question}>
          <h2 className="text-lg font-bold text-navy">{item.question}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-700">{item.answer}</p>
        </Card>
      ))}
    </div>
  );
}
