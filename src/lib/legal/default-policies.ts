import type { PolicySection } from "@/components/legal/policy-page";
import type { SiteSettings } from "@/lib/settings";

function configuredContacts(settings: SiteSettings): string[] {
  return [
    settings.supportEmail?.trim() ? `support email ${settings.supportEmail.trim()}` : null,
    settings.contactEmail?.trim() && settings.contactEmail !== settings.supportEmail
      ? `email ${settings.contactEmail.trim()}`
      : null,
    settings.contactPhone?.trim() ? `phone ${settings.contactPhone.trim()}` : null,
  ].filter((value): value is string => Boolean(value));
}

export function defaultPrivacySections(settings: SiteSettings): PolicySection[] {
  const contacts = configuredContacts(settings);
  return [
    {
      heading: "Information collected",
      body: "Depending on how you use the portal, we collect account information such as name, email address, phone number and role; candidate profile details, education, work history, skills and preferences; resumes and other files you choose to upload; job searches, saved jobs, applications, application status and recruiter interactions; employer account, company and job-post information; payment references such as Razorpay order/payment IDs, amounts, status and invoices (not card numbers or card security data); and technical logs, device/browser information, security events and cookies or similar session technologies.",
    },
    {
      heading: "Purposes and legal basis",
      body: "We use this information to create and secure accounts, operate candidate profiles and job applications, provide employer recruiting tools, administer subscriptions and invoices, send service and security communications, moderate listings and prevent fraud or abuse, answer support requests, maintain and improve the portal, and meet legal and accounting duties. We process information as needed to provide a service you request, to meet legal obligations, and for legitimate interests such as security and service reliability, subject to applicable data-protection law.",
    },
    {
      heading: "Sharing with employers and recruiters",
      body: "When you apply for a job, the employer responsible for that listing receives the information you submit with that application. Recruiters may access candidate profile and resume information through resume search only when their active plan permits that feature and the candidate has opted in to being discoverable. We do not make a candidate discoverable solely because they have a paid plan.",
    },
    {
      heading: "Service providers",
      body: "We use hosting providers to operate and secure the portal, email providers to deliver messages, and Razorpay to process payment transactions. This application receives payment references and transaction status but does not store card data. Providers process information only as needed to deliver their services and under applicable contractual and legal safeguards.",
    },
    {
      heading: "Support emails and optional AI assistance",
      body: "When you send a support email to Ravelyth, we store and handle that email, including its plain-text content and basic delivery details, so we can answer you and keep a record of the request. When optional AI assistance is enabled by us, the text of support emails may be processed by a third-party AI provider to suggest a category and draft a reply. AI assistance is off by default, drafts are never sent automatically, and no AI feature receives candidate, resume or payment records.",
    },
    {
      heading: "Business contact outreach and opt-out",
      body: "Ravelyth contacts business leads only from lists our administrators add or import manually. A business contact who receives outreach can opt out at any time using the unsubscribe link included in every outreach email or by contacting us; the address is then added to a suppression list and receives no further outreach. A business contact can also ask us to delete their stored lead record, and we will remove it subject to any records we must retain by law.",
    },
    {
      heading: "Retention",
      body: "We retain account, profile, resume, application, payment-reference, log and support records for as long as needed to operate the portal, comply with legal and accounting requirements, resolve disputes, enforce platform terms and protect users. Retention periods vary by record type. When information is no longer required, we delete or de-identify it where reasonably practicable, subject to lawful retention and backup cycles.",
    },
    {
      heading: "Your rights and choices",
      body: "You may access and correct account and profile details through your account, change whether your profile is discoverable, and request access to, correction of, or deletion of personal information, subject to applicable law and records we must retain. Deleting information may limit or end access to parts of the portal. You may withdraw an optional consent or opt-in through the relevant account setting or by contacting support.",
    },
    {
      heading: "Security",
      body: "We use access controls and reasonable technical and organizational safeguards to protect personal information, including restricted administrative access, secure sessions and protected payment processing. No internet transmission or storage system can be guaranteed completely secure; please use a unique password and report suspected account misuse promptly.",
    },
    {
      heading: "Children",
      body: "The portal is intended for people seeking or offering employment and is not directed to children under 18. We do not knowingly seek to collect personal information from children under 18. If you believe a child has provided information, contact us so it can be reviewed and removed where required by law.",
    },
    {
      heading: "DPDP Act requests and privacy contact",
      body: `${contacts.length ? `You may contact us using ${contacts.join(" or ")} or ` : ""}submit a request through the support form at /contact for access, correction, erasure or other personal-data requests under the Digital Personal Data Protection Act, 2023. We will verify the request and respond in accordance with applicable law.`,
    },
  ];
}

export function defaultTermsSections(settings: SiteSettings): PolicySection[] {
  const contacts = configuredContacts(settings);
  const jurisdiction = settings.jurisdictionCity?.trim();
  return [
    {
      heading: "Platform role",
      body: `${settings.brandName} is an intermediary job-listing and recruitment technology platform. It is not an employer, staffing agency, or recruiter of record for any listing and does not participate in an employer's hiring decision or employment relationship.`,
    },
    {
      heading: "No hiring or applicant guarantee",
      body: "We do not guarantee that a job will be filled, that an employer will receive any particular number or quality of applicants, that a candidate will receive an interview or offer, or that information supplied by another user is accurate. Users must independently assess opportunities and counterparties.",
    },
    {
      heading: "Accounts and candidate use",
      body: "Provide accurate account and profile information, protect your credentials and promptly report suspected unauthorized use. Candidates may browse and apply to jobs free of charge; no candidate is charged for applying. Candidates are responsible for the accuracy of their resumes and application materials and should share only information they are comfortable providing to the relevant employer.",
    },
    {
      heading: "Employer duties and prohibited job content",
      body: "Employers are solely responsible for the accuracy, legality and currency of company details, job requirements, compensation and hiring communications, and for compliance with employment, privacy and anti-discrimination laws. Employers must never charge candidates any fee, deposit or other amount to apply for, interview for, or obtain a job. Posts must not contain scams, misleading earnings claims, unlawful discrimination, adult content, unlawful offers, deceptive links, requests for candidate payment, or other prohibited or harmful material.",
    },
    {
      heading: "Moderation and account restrictions",
      body: "We may review, hold, edit for presentation, pause or remove a job post and may restrict or suspend an account when reasonably needed to protect users, enforce these terms, respond to reports, comply with law or address suspected abuse. A moderation decision does not make us the employer or guarantee the accuracy of remaining content.",
    },
    {
      heading: "Permission to display and promote employer content",
      body: `${settings.brandName} may display and promote an employer's job posts and company name on the portal and on ${settings.brandName}'s own social media channels, free of charge, for the purpose of operating and promoting the portal. The employer grants us the permission needed for that display and promotion and confirms it has authority to provide the content. The employer retains ownership of its content.`,
    },
    {
      heading: "Employer post limits and free post",
      body: "Each company receives one free job post for its lifetime, subject to the free-credit setting in effect when it submits a post. The credit is consumed when a post is submitted and has no cash value; a post rejected after submission does not restore the credit, except where an automatic safety scan blocks it before publication. After the free credit is used, an active paid employer plan is required. Paid plan posting limits are determined by the selected plan and apply for its active billing period.",
    },
    {
      heading: "Plans, payments and expiry",
      body: "Plan prices, features, limits and applicable taxes are shown in INR before checkout. Subscription periods are monthly or yearly as selected, do not automatically renew, and require a new payment to continue. A newly purchased plan takes effect immediately and replaces the prior active plan without prorating or refunding its unused period. On expiry, paid features and plan-based limits end; benefits are not guaranteed beyond the paid period. GST is not applicable while the configured GST rate is zero; any configured tax treatment is shown on the applicable invoice.",
    },
    {
      heading: "Candidate Premium",
      body: "Candidate Premium is an optional paid plan. While the candidate has an active, unexpired Premium subscription, the plan may provide the premium Resume Builder, a Premium badge visible to recruiters, and priority ordering among otherwise equally matched candidates. These features are controlled by the active plan entitlements and stop when the subscription expires or is cancelled. Premium does not improve hiring outcomes and does not make a candidate discoverable without the candidate's opt-in.",
    },
    {
      heading: "Confidentiality and data protection",
      body: "Users must protect information they receive through the portal and use it only for legitimate recruitment and account purposes. Employers must keep candidate information confidential, limit access to people involved in hiring, and comply with applicable data-protection obligations. Our collection and use of personal information is described in the Privacy Policy.",
    },
    {
      heading: "Limitation of liability",
      body: "To the maximum extent permitted by law, the portal is provided on an as-available basis. We are not liable for user-submitted listings, a user's hiring or application outcome, interruption caused by events outside our reasonable control, or indirect, incidental or consequential loss. Nothing in these terms excludes liability or statutory rights that cannot lawfully be excluded or limited.",
    },
    {
      heading: "Termination",
      body: "You may stop using the portal at any time and may request account deletion subject to legal, security and accounting retention requirements. We may suspend or terminate access for a material breach, suspected fraud or abuse, legal requirement, or discontinuation of a service. Terms that by their nature should continue, including confidentiality, data protection, payment records and liability provisions, continue to apply as required.",
    },
    {
      heading: "Governing law and courts",
      body: jurisdiction
        ? `These terms are governed by the laws of India. Subject to mandatory law, courts located in ${jurisdiction}, India have jurisdiction.`
        : "These terms are governed by the laws of India. Subject to mandatory law, courts in India have jurisdiction.",
    },
    ...(contacts.length
      ? [{
          heading: "Grievance officer",
          body: `For a grievance concerning these terms or the portal, contact the grievance officer through ${contacts.join(" or ")}. Please include enough information to identify the issue without sending passwords, OTPs or full payment-card details.`,
        }]
      : []),
  ];
}

export function defaultRefundSections(settings: SiteSettings): PolicySection[] {
  const contacts = configuredContacts(settings);
  return [
    {
      heading: "Subscription charges",
      body: "Subscription payments are non-refundable once the subscription has been activated, except for duplicate charges, an amount debited without activation, or a billing error. A duplicate charge will be reviewed and the excess amount refunded. If a payment was debited but the subscription did not activate, after verification we will either activate the subscription or refund the payment within 7 working days. Billing errors will be corrected, with any resulting refund handled after verification.",
    },
    {
      heading: "Cancellation and renewals",
      body: "Plans do not auto-renew and no automatic debit is taken. Cancellation stops future renewals only; because there is no auto-debit, a fresh payment is required to continue after the current paid period. Unless access is restricted for a policy or legal reason, paid features remain available until the period expires.",
    },
    {
      heading: "Free services",
      body: "The employer's one-time free job post has no cash value and cannot be redeemed for money or transferred to another company. Candidates are never charged for browsing or applying to jobs.",
    },
    {
      heading: "How to request help",
      body: contacts.length
        ? `For a duplicate charge, non-activation, billing error or other payment query, contact us using ${contacts.join(" or ")}. Include the account email, approximate transaction date and Razorpay order or payment reference where available. Never send a password, OTP or full card details. We will verify the payment and respond within 7 working days for a debit-without-activation issue.`
        : "For a payment issue, use the support/contact channel available on the portal. Include the account email, approximate transaction date and Razorpay order or payment reference where available. Never send a password, OTP or full card details. We will verify the payment and respond within 7 working days for a debit-without-activation issue.",
    },
  ];
}
