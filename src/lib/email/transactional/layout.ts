/**
 * Shared HTML layout and helpers for transactional email templates.
 *
 * Every template in this directory must use `layout()` so that user-supplied
 * values are escaped consistently and the branding stays configurable.
 *
 * Rules that apply to ALL templates:
 *
 *  - Every user-supplied value (name, job title, company name, reason) is HTML
 *    escaped. A user chooses their own display name, so it is never
 *    interpolated raw.
 *  - No password, verification token or reset token is ever displayed. Links
 *    carry the token in the URL only, generated server-side from APP_URL and
 *    escaped inside the HTML attribute as defence in depth.
 *  - Brand copy uses the configurable product name, so no brand string is
 *    hard-coded per template.
 */

export const DEFAULT_BRAND = 'Ravelyth Talent';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Backwards-compatible alias used by existing tests and callers. */
export function escapeHtmlText(value: string): string {
  return escapeHtml(value);
}

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateContext {
  brand?: string;
}

export function resolveBrand(context?: TemplateContext): string {
  return context?.brand && context.brand.length > 0 ? context.brand : DEFAULT_BRAND;
}

/** Wraps body rows in the shared branded table layout. */
export function layout(brand: string, rows: string): string {
  const safeBrand = escapeHtml(brand);
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Helvetica,Arial,sans-serif;">',
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">',
    '    <tr>',
    '      <td align="center">',
    '        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">',
    `          <tr><td style="font-size:22px;font-weight:600;color:#0f172a;">${safeBrand}</td></tr>`,
    '          <tr><td style="height:20px;">&nbsp;</td></tr>',
    rows,
    '          <tr><td style="height:24px;"></td></tr>',
    `          <tr><td style="font-size:13px;color:#94a3b8;">&mdash; The ${safeBrand} team</td></tr>`,
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('\n');
}

/** A styled paragraph row. */
export function paragraph(text: string): string {
  return `          <tr><td style="font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(
    text
  )}</td></tr>`;
}

/** A smaller, muted note row. */
export function note(text: string): string {
  return `          <tr><td style="font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(
    text
  )}</td></tr>`;
}

/** The "Hi <name>," greeting row. */
export function greeting(recipientName: string): string {
  const name = recipientName.length > 0 ? recipientName : 'there';
  return `          <tr><td style="font-size:16px;line-height:1.6;color:#334155;">Hi ${escapeHtml(
    name
  )},</td></tr>`;
}

/** Vertical spacer row. */
export function spacer(height = 16): string {
  return `          <tr><td style="height:${height}px;">&nbsp;</td></tr>`;
}

/** A CTA button plus a copyable fallback link (the token appears only here). */
export function actionBlock(label: string, url: string): string {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  return [
    '          <tr><td align="center">',
    `            <a href="${safeUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;padding:12px 24px;border-radius:6px;font-weight:600;text-decoration:none;">${safeLabel}</a>`,
    '          </td></tr>',
    '          <tr><td style="height:16px;">&nbsp;</td></tr>',
    '          <tr><td style="font-size:13px;line-height:1.5;color:#64748b;">If the button does not work, copy and paste this link into your browser:</td></tr>',
    `          <tr><td style="font-size:12px;line-height:1.5;color:#475569;word-break:break-all;">${safeUrl}</td></tr>`,
    '          <tr><td style="height:16px;">&nbsp;</td></tr>',
  ].join('\n');
}
