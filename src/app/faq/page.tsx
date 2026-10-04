import type { Metadata } from 'next';
import { InfoPage, InfoSection } from '@/components/layout/info-page';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers about how Ravelyth Talent works: accounts, applications, hiring, pricing and data protection.',
  alternates: { canonical: '/faq' },
};

const faqs = [
  {
    question: 'Is it free to look for a job?',
    answer:
      'Yes. Creating an account, maintaining your profile, and applying to jobs are free for every candidate. You never need a plan to be considered for a role.',
  },
  {
    question: 'How do I apply for a job?',
    answer:
      'Sign in and open the role on the job board. Applying records your profile and the resume you choose against that specific job, and you can then follow its progress from your candidate dashboard.',
  },
  {
    question: 'Can an employer see my resume before I apply?',
    answer:
      'No. Resumes are private by default. An employer can only read a resume once you have applied to one of their roles with it, and consent for that purpose is separate from the others.',
  },
  {
    question: 'Can I withdraw my consent?',
    answer:
      'Yes. Each purpose is recorded separately, so you can withdraw one without affecting the others. Withdrawing consent for job applications means you can no longer apply through the platform until it is restored.',
  },
  {
    question: 'How does job posting work?',
    answer:
      'Employers buy job credits or use the allowance included in their recruiter plan, then submit a vacancy. Every submission is reviewed before it is published, so candidates only browse checked listings.',
  },
  {
    question: 'What do recruiter plans include?',
    answer:
      'A monthly job-post allowance, a company profile, application management, and notifications. When the allowance is used up you can buy prepaid job credits or upgrade your plan at any time.',
  },
  {
    question: 'Why do I need to verify my email address?',
    answer:
      'Applying to a job requires a verified address, so employers are not filling their pipeline with unreachable people. The verification link is sent as soon as you register.',
  },
  {
    question: 'How is my personal data handled?',
    answer:
      'Passwords are stored only as Argon2id hashes and are never logged. Sessions are server-side with an HttpOnly cookie. Ravelyth Talent does not sell or share your data.',
  },
  {
    question: 'I found a problem or inappropriate content. What should I do?',
    answer:
      'Use the report form on the job or company, or the contact page. Reports go directly to the moderation team and every action taken is recorded in an audit trail.',
  },
];

export default function Page(): React.ReactElement {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  });

  return (
    <InfoPage
      title="Frequently asked questions"
      intro="How Ravelyth Talent works for candidates, employers and agencies."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {faqs.map((faq) => (
        <InfoSection key={faq.question} title={faq.question}>
          <p>{faq.answer}</p>
        </InfoSection>
      ))}
    </InfoPage>
  );
}
