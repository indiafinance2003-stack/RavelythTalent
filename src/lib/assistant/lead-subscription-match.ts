export type LeadForSubscriptionMatch = {
  email: string;
  website: string | null;
};

export type SubscribedCompanyContact = {
  contactEmail: string | null;
  website: string | null;
  websiteDomain: string | null;
};

function domain(value: string | null): string | null {
  if (!value) return null;
  try {
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const hostname = new URL(normalized).hostname.toLocaleLowerCase("en");
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function matchesSubscribedCompany(
  lead: LeadForSubscriptionMatch,
  company: SubscribedCompanyContact,
): boolean {
  if (
    lead.email.toLocaleLowerCase("en") ===
    company.contactEmail?.toLocaleLowerCase("en")
  ) return true;
  const leadDomain = domain(lead.website);
  return Boolean(leadDomain && [
    domain(company.website),
    domain(company.websiteDomain),
  ].includes(leadDomain));
}
