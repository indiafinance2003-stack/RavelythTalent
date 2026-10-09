/* -------------------------------------------------------------------------- */
/* Email extraction, ranking and classification (pure)                        */
/* -------------------------------------------------------------------------- */

export type ExtractedKind = "hr" | "generic" | "other";

export type ExtractedEmail = {
  email: string;
  kind: ExtractedKind;
  sourceUrl: string;
};

/** HR-type local parts ranked first. */
export const HR_LOCAL_PARTS = [
  "hr",
  "careers",
  "jobs",
  "recruitment",
  "recruiting",
  "talent",
  "hiring",
  "people",
] as const;

/** Role addresses we must never record or contact. */
export const EMAIL_BLOCKLIST = [
  "dpo",
  "privacy",
  "legal",
  "abuse",
  "postmaster",
  "noreply",
  "no-reply",
  "security",
  "press",
  "webmaster",
] as const;

/** Generic role addresses ranked after HR, before personal names. */
const GENERIC_LOCAL_PARTS = [
  "info",
  "information",
  "contact",
  "contacts",
  "enquiry",
  "enquiries",
  "inquiry",
  "inquiries",
  "hello",
  "admin",
  "office",
  "team",
  "mail",
  "general",
  "business",
] as const;

/**
 * Business email matcher used on hrefs and visible text. Deliberately strict:
 * no quoted local parts, no IP-literal domains, a 2+ label TLD.
 */
const EMAIL_PATTERN = /\b[a-z0-9][a-z0-9._%+-]{0,62}[a-z0-9]@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi;

/** Obfuscation markers we reject even if a pattern matches around them. */
const OBFUSCATION_MARKERS = /\[(?:at|dot)]|\((?:at|dot)\)|\s(?:at|dot)\s|\[email]|\{at\}|\{dot\}/i;

function isBlockedLocalPart(local: string): boolean {
  const normalized = local.toLocaleLowerCase("en");
  return (EMAIL_BLOCKLIST as readonly string[]).some(
    (blocked) => normalized === blocked || normalized === blocked.replace(/-/g, ""),
  );
}

/** Public helper: classifies a full email address into hr/generic/other. */
export function classifyEmailKind(email: string): ExtractedKind {
  return classifyLocalPart(email.split("@")[0] ?? "");
}

function classifyLocalPart(local: string): ExtractedKind {
  const normalized = local.toLocaleLowerCase("en");
  if ((HR_LOCAL_PARTS as readonly string[]).includes(normalized)) return "hr";
  if (GENERIC_LOCAL_PARTS.includes(normalized as (typeof GENERIC_LOCAL_PARTS)[number])) {
    return "generic";
  }
  return "other";
}

/**
 * Returns true when the email domain belongs to the crawled site's own
 * domain (equal or subdomain) or is clearly the company's own mail because
 * the site domain is a subdomain of the email domain.
 */
export function isOwnDomainEmail(emailDomain: string, siteDomain: string): boolean {
  const email = emailDomain.toLocaleLowerCase("en").replace(/^www\./, "");
  const site = siteDomain.toLocaleLowerCase("en").replace(/^www\./, "");
  if (!email || !site) return false;
  if (email === site) return true;
  if (email.endsWith(`.${site}`)) return true;
  if (site.endsWith(`.${email}`)) return true;
  return false;
}

/** Normalizes and validates one candidate address; null when unusable. */
export function normalizeCandidateEmail(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^mailto:/i, "")
    .split(/[?#]/)[0]
    ?? "";
  const value = cleaned.trim().toLocaleLowerCase("en");
  if (!value || value.length > 254) return null;
  if (OBFUSCATION_MARKERS.test(value)) return null;
  const localPattern = /^[a-z0-9][a-z0-9._%+-]{0,62}[a-z0-9]$/i;
  const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!localPattern.test(local) || !domainPattern.test(domain)) return null;
  if (value.includes("..")) return null;
  if (isBlockedLocalPart(local)) return null;
  return value;
}

/**
 * Extracts business emails from a page: mailto: hrefs first, then visible
 * text (tags stripped so image alt text and hidden attributes are ignored).
 * Only addresses on the site's own domain are kept.
 */
export function extractEmailsFromHtml(html: string, pageUrl: string, siteDomain: string): ExtractedEmail[] {
  const found = new Map<string, ExtractedEmail>();

  const add = (raw: string, source: string): void => {
    const email = normalizeCandidateEmail(raw);
    if (!email) return;
    const domain = email.split("@")[1] ?? "";
    if (!isOwnDomainEmail(domain, siteDomain)) return;
    const kind = classifyLocalPart(email.split("@")[0] ?? "");
    if (!found.has(email)) found.set(email, { email, kind, sourceUrl: source });
  };

  // mailto: links (href values only).
  const mailtoPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = mailtoPattern.exec(html)) !== null) {
    const href = match[1] ?? "";
    if (!/^mailto:/i.test(href)) continue;
    for (const part of href.slice("mailto:".length).split(",")) {
      add(part, pageUrl);
    }
  }

  // Visible text: strip comments, script/style blocks and all tags.
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#64;/gi, "@")
    .replace(/&#0*64;/gi, "@")
    .replace(/\s+/g, " ");
  EMAIL_PATTERN.lastIndex = 0;
  while ((match = EMAIL_PATTERN.exec(visible)) !== null) {
    add(match[0], pageUrl);
  }

  // HR first, then generic, then others; alphabetical within each tier.
  const tier = { hr: 0, generic: 1, other: 2 } as const;
  return [...found.values()].sort((a, b) =>
    tier[a.kind] - tier[b.kind] || a.email.localeCompare(b.email));
}

/** True when a page contains a contact form (message + name/email field). Never submitted. */
export function detectContactForm(html: string): boolean {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  for (const form of forms) {
    const lowered = form.toLocaleLowerCase("en");
    const hasMessage = /<textarea\b/i.test(form) || /name\s*=\s*["'][^"']*(message|comment|enquiry|inquiry|description)[^"']*["']/i.test(lowered);
    if (!hasMessage) continue;
    const hasIdentity =
      /type\s*=\s*["']email["']/i.test(form) ||
      /name\s*=\s*["'][^"']*(email|e-mail|name|full-?name|first-?name)[^"']*["']/i.test(lowered);
    if (hasIdentity) return true;
  }
  return false;
}

/**
 * Candidate discovery paths: homepage plus contact/about/careers pages when
 * linked or present. Same-origin http(s) only, max 6.
 */
export function discoverCandidatePaths(html: string, pageUrl: string): string[] {
  const wanted = ["/contact", "/contact-us", "/about", "/about-us", "/careers", "/jobs"];
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)].map((m) => m[1] ?? "");
  const found: string[] = [];
  try {
    const base = new URL(pageUrl);
    for (const href of hrefs) {
      let path = "";
      try {
        const resolved = new URL(href, base);
        if (resolved.origin !== base.origin) continue;
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
        path = resolved.pathname.toLocaleLowerCase("en").replace(/\/+$/, "") || "/";
      } catch {
        continue;
      }
      const match = wanted.find((w) => path === w || path.startsWith(`${w}/`));
      if (match && !found.includes(match)) found.push(match);
    }
  } catch {
    return [];
  }
  return found.slice(0, 5);
}
