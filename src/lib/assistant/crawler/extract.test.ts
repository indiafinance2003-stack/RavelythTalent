import { describe, expect, it } from "vitest";
import {
  detectContactForm,
  extractEmailsFromHtml,
  isOwnDomainEmail,
  normalizeCandidateEmail,
} from "./extract";

describe("normalizeCandidateEmail", () => {
  it("lowercases and strips mailto and query strings", () => {
    expect(normalizeCandidateEmail("mailto:HR@Example.in?subject=hi")).toBe("hr@example.in");
  });

  it("rejects obfuscated addresses", () => {
    expect(normalizeCandidateEmail("hr [at] example.in")).toBeNull();
  });

  it("rejects invalid addresses", () => {
    expect(normalizeCandidateEmail("not-an-email")).toBeNull();
    expect(normalizeCandidateEmail("a@b")).toBeNull();
  });

  it("blocks role addresses we must never contact", () => {
    expect(normalizeCandidateEmail("privacy@example.in")).toBeNull();
    expect(normalizeCandidateEmail("no-reply@example.in")).toBeNull();
    expect(normalizeCandidateEmail("noreply@example.in")).toBeNull();
  });
});

describe("isOwnDomainEmail", () => {
  it("accepts the same domain and its subdomains", () => {
    expect(isOwnDomainEmail("example.in", "example.in")).toBe(true);
    expect(isOwnDomainEmail("mail.example.in", "example.in")).toBe(true);
    expect(isOwnDomainEmail("www.example.in", "example.in")).toBe(true);
  });

  it("accepts a parent domain of the site (company mail on a parent)", () => {
    expect(isOwnDomainEmail("example.in", "careers.example.in")).toBe(true);
  });

  it("rejects unrelated domains", () => {
    expect(isOwnDomainEmail("gmail.com", "example.in")).toBe(false);
  });
});

describe("extractEmailsFromHtml", () => {
  const html = `
    <html><body>
      <a href="mailto:info@example.in">Email us</a>
      <p>Reach our HR at hr@example.in or jobs@example.in</p>
      <p>Ignore third parties: someone@gmail.com</p>
      <p>Ignored role: postmaster@example.in</p>
      <img alt="sales@example.in" />
    </body></html>`;

  it("extracts own-domain emails, ranks HR first and drops others", () => {
    const found = extractEmailsFromHtml(html, "https://example.in/", "example.in");
    const emails = found.map((item) => item.email);
    expect(emails).toContain("hr@example.in");
    expect(emails).toContain("jobs@example.in");
    expect(emails).toContain("info@example.in");
    expect(emails).not.toContain("someone@gmail.com");
    expect(emails).not.toContain("postmaster@example.in");
    expect(emails).not.toContain("sales@example.in");
    expect(found[0]?.kind).toBe("hr");
  });

  it("ignores image alt text", () => {
    const found = extractEmailsFromHtml('<img alt="hidden@example.in" src="x">', "https://example.in/", "example.in");
    expect(found).toHaveLength(0);
  });
});

describe("detectContactForm", () => {
  it("detects a form with a message textarea and an email field", () => {
    const form = `<form action="/contact"><input name="email" type="email"><textarea name="message"></textarea><button>Send</button></form>`;
    expect(detectContactForm(form)).toBe(true);
  });

  it("detects a form with a name field and a message input", () => {
    const form = `<form><input name="full_name"><input name="message"><button>Send</button></form>`;
    expect(detectContactForm(form)).toBe(true);
  });

  it("ignores search and login forms", () => {
    expect(detectContactForm('<form><input name="q" type="search"></form>')).toBe(false);
    expect(detectContactForm('<form><input name="username"><input name="password" type="password"></form>')).toBe(false);
  });
});
