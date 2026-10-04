import { escapeHtml } from "@/lib/utils";

/**
 * Shared, responsive, brand-styled email layout.
 *
 * Built with table-based markup and inline styles so it renders correctly in
 * Outlook / Gmail / Apple Mail. Every email has a plain-text alternative.
 */

export type EmailBrand = {
  brandName: string;
  tagline?: string | null;
  contactEmail?: string | null;
  supportEmail?: string | null;
  address?: string | null;
  social?: Array<{ label: string; url: string }>;
};

export const DEFAULT_BRAND: EmailBrand = {
  brandName: "Ravelyth Talent",
  tagline: "Connecting Great People with Great Opportunities",
  contactEmail: null,
  supportEmail: null,
  address: null,
  social: [],
};

const NAVY = "#0B2A6F";
const ROYAL = "#1F6FEB";
const TEAL = "#3DB8B0";
const SLATE = "#475569";
const SKY = "#DCEBFB";
const OFFWHITE = "#FAFAF8";

export type EmailBlock =
  | { type: "paragraph"; text: string; muted?: boolean }
  | { type: "bullets"; items: string[] }
  | { type: "detail"; rows: Array<{ label: string; value: string }> }
  | { type: "note"; text: string }
  | { type: "divider" }
  | { type: "quote"; text: string };

export type EmailOptions = {
  subject: string;
  preheader?: string;
  heading: string;
  intro?: string;
  blocks?: EmailBlock[];
  cta?: { label: string; url: string };
  secondaryCta?: { label: string; url: string };
  footerNote?: string;
  unsubscribeUrl?: string;
  brand?: EmailBrand;
};

function blockHtml(block: EmailBlock): string {
  switch (block.type) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${
        block.muted ? SLATE : "#1F2937"
      };">${escapeHtml(block.text)}</p>`;
    case "bullets":
      return `<ul style="margin:0 0 16px;padding-left:20px;color:#1F2937;font-size:15px;line-height:1.7;">${block.items
        .map((i) => `<li style="margin-bottom:6px;">${escapeHtml(i)}</li>`)
        .join("")}</ul>`;
    case "detail":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border-collapse:collapse;"><tbody>${block.rows
        .map(
          (r) => `<tr>
            <td style="padding:8px 12px;background:${OFFWHITE};border-radius:8px;font-size:14px;color:${SLATE};white-space:nowrap;">${escapeHtml(
              r.label,
            )}</td>
            <td style="padding:8px 12px;font-size:14px;color:${NAVY};font-weight:600;">${escapeHtml(
              r.value,
            )}</td>
          </tr>`,
        )
        .join("")}</tbody></table>`;
    case "note":
      return `<div style="margin:0 0 16px;padding:14px 16px;background:${SKY};border-radius:12px;font-size:14px;line-height:1.6;color:${NAVY};">${escapeHtml(
        block.text,
      )}</div>`;
    case "divider":
      return `<div style="height:1px;background:#E2E8F0;margin:24px 0;"></div>`;
    case "quote":
      return `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${TEAL};background:${OFFWHITE};border-radius:0 12px 12px 0;font-size:14px;color:${SLATE};">${escapeHtml(
        block.text,
      )}</blockquote>`;
    default:
      return "";
  }
}

function button(label: string, url: string, primary = true): string {
  const bg = primary ? ROYAL : "transparent";
  const color = primary ? "#FFFFFF" : NAVY;
  const border = primary ? ROYAL : "#CBD5E1";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 12px 12px 0;"><tr><td style="border-radius:12px;background:${bg};border:1px solid ${border};">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:${color};text-decoration:none;border-radius:12px;">${escapeHtml(
      label,
    )}</a>
  </td></tr></table>`;
}

function footerHtml(brand: EmailBrand, footerNote?: string, unsubscribeUrl?: string): string {
  const contactLine = [
    brand.supportEmail ? `Support: ${brand.supportEmail}` : null,
    brand.contactEmail ? `Contact: ${brand.contactEmail}` : null,
    brand.address,
  ]
    .filter(Boolean)
    .join(" &nbsp;|&nbsp; ");

  const socialLine = brand.social?.length
    ? `<p style="margin:8px 0 0;font-size:12px;color:${SLATE};">${brand.social
        .map(
          (s) =>
            `<a href="${escapeHtml(s.url)}" style="color:${ROYAL};text-decoration:none;">${escapeHtml(s.label)}</a>`,
        )
        .join(" &nbsp;|&nbsp; ")}</p>`
    : "";

  return `<tr><td style="padding:24px 32px;background:${OFFWHITE};border-radius:0 0 16px 16px;">
    ${footerNote ? `<p style="margin:0 0 10px;font-size:13px;color:${SLATE};line-height:1.6;">${escapeHtml(footerNote)}</p>` : ""}
    ${contactLine ? `<p style="margin:0;font-size:12px;color:${SLATE};line-height:1.7;">${escapeHtml(contactLine)}</p>` : ""}
    ${socialLine}
    <p style="margin:12px 0 0;font-size:11px;color:#94A3B8;">&copy; ${new Date().getFullYear()} ${escapeHtml(
      brand.brandName,
    )}. All rights reserved.</p>
    ${
      unsubscribeUrl
        ? `<p style="margin:6px 0 0;font-size:11px;color:#94A3B8;">You are receiving this email as a registered user.
             <a href="${escapeHtml(unsubscribeUrl)}" style="color:${ROYAL};">Unsubscribe</a></p>`
        : ""
    }
  </td></tr>`;
}

/** Renders both the HTML and the plain-text alternative. */
export function composeEmail(options: EmailOptions): {
  html: string;
  text: string;
  subject: string;
} {
  const brand = options.brand ?? DEFAULT_BRAND;
  const inner = (options.blocks ?? []).map(blockHtml).join("");

  const buttons =
    options.cta || options.secondaryCta
      ? `<div style="margin:24px 0 8px;">${
          options.cta ? button(options.cta.label, options.cta.url, true) : ""
        }${options.secondaryCta ? button(options.secondaryCta.label, options.secondaryCta.url, false) : ""}</div>`
      : "";

  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    options.subject,
  )}</title></head>
<body style="margin:0;padding:0;background:#EEF2F7;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
    options.preheader ?? options.intro ?? "",
  )}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;padding:24px 12px;background:#EEF2F7;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:16px;box-shadow:0 8px 24px rgba(11,42,111,0.10);overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:20px;font-weight:800;color:${NAVY};letter-spacing:-0.3px;">${escapeHtml(
            brand.brandName,
          )} <span style="color:${TEAL};font-weight:800;">Talent</span></p>
          ${
            brand.tagline
              ? `<p style="margin:4px 0 0;font-size:12px;color:${SLATE};">${escapeHtml(brand.tagline)}</p>`
              : ""
          }
        </td></tr>
        <tr><td style="height:4px;background:linear-gradient(90deg,${TEAL} 0%,${ROYAL} 100%);"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;color:${NAVY};">${escapeHtml(options.heading)}</h1>
          ${
            options.intro
              ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#1F2937;">${escapeHtml(options.intro)}</p>`
              : ""
          }
          ${inner}
          ${buttons}
        </td></tr>
        ${footerHtml(brand, options.footerNote, options.unsubscribeUrl)}
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#94A3B8;text-align:center;">${escapeHtml(
        brand.brandName,
      )}</p>
    </td></tr>
  </table>
</body></html>`;

  const textLines: string[] = [];
  textLines.push(brand.brandName);
  if (brand.tagline) textLines.push(brand.tagline);
  textLines.push("");
  textLines.push(options.heading);
  textLines.push("=".repeat(Math.min(72, options.heading.length)));
  if (options.intro) {
    textLines.push(options.intro);
    textLines.push("");
  }
  for (const block of options.blocks ?? []) {
    switch (block.type) {
      case "paragraph":
        textLines.push(block.text, "");
        break;
      case "bullets":
        textLines.push(...block.items.map((i) => `  - ${i}`), "");
        break;
      case "detail":
        textLines.push(...block.rows.map((r) => `  ${r.label}: ${r.value}`), "");
        break;
      case "note":
        textLines.push(`  ${block.text}`, "");
        break;
      case "quote":
        textLines.push(`  > ${block.text}`, "");
        break;
      case "divider":
        textLines.push("-".repeat(48), "");
        break;
      default:
        break;
    }
  }
  if (options.cta) textLines.push(`${options.cta.label}: ${options.cta.url}`);
  if (options.secondaryCta)
    textLines.push(`${options.secondaryCta.label}: ${options.secondaryCta.url}`);
  textLines.push("");
  if (options.footerNote) textLines.push(options.footerNote);
  const contact = [brand.supportEmail, brand.contactEmail, brand.address]
    .filter(Boolean)
    .join(" | ");
  if (contact) textLines.push(contact);
  if (options.unsubscribeUrl) {
    textLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);
  }
  textLines.push(`© ${new Date().getFullYear()} ${brand.brandName}`);

  return {
    html,
    text: textLines.join("\n"),
    subject: options.subject,
  };
}