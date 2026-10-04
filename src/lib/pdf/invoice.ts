import 'server-only';

import { PDF_FONT_BOLD, PDF_FONT_SERIF_BOLD } from './fonts';
import { PdfWriter, type PdfTheme } from './document';
import { formatDate, formatMoney } from '@/lib/portal-client/format';

/**
 * Invoice PDF rendering.
 *
 * The invoice is a tax document, so two rules are absolute:
 *
 *  1. EVERY NUMBER COMES FROM THE STORED SNAPSHOT. Nothing is looked up from the
 *     plan catalogue at render time, because a repriced plan must never rewrite a
 *     document a customer already holds. The tax rate printed is the snapshot's own
 *     rate, not the current `BILLING_TAX_RATE_BASIS_POINTS`.
 *  2. THE TOTAL IS PROVED, NOT ASSERTED. A customer reading an invoice should be
 *     able to add the line items and reach the total themselves. When the snapshot
 *     does not reconcile, that is stated on the document rather than hidden — a
 *     real discrepancy is information the payer needs, not an embarrassment to
 *     suppress.
 */

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
  taxRateBasisPoints: number;
  isTaxLine: boolean;
}

export interface InvoiceRenderInput {
  invoiceNumber: string;
  description: string;
  status: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxRateBasisPoints: number;
  billingPeriod: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paymentReference: string | null;
  notes: string | null;
  issuedAt: Date;
  paidAt: Date | null;
  lines: InvoiceLineInput[];
}

export interface RenderedInvoice {
  body: Buffer;
  /** Whether the line items plus tax add up to the stated total. */
  reconciles: boolean;
}

const INVOICE_THEME: PdfTheme = {
  accent: '0f172a',
  accentSoft: 'f1f5f9',
  text: '0f172a',
  muted: '64748b',
  rule: 'cbd5e1',
  pageBackground: 'ffffff',
};

/**
 * Checks that the line items add up to the total.
 *
 * Tax lines are excluded from the sum: `totalMinor` already includes the tax, so
 * adding a tax line on top would double-count it.
 */
export function invoiceReconciles(input: InvoiceRenderInput): boolean {
  const lineSum = input.lines
    .filter((line) => !line.isTaxLine)
    .reduce((sum, line) => sum + line.amountMinor, 0);
  return lineSum + input.taxMinor === input.totalMinor;
}

/** One label-over-value pair, used in the bill-to and document-detail blocks. */
function detailPair(writer: PdfWriter, label: string, value: string): void {
  if (!value.trim()) return;
  writer.text(label.toUpperCase(), { font: PDF_FONT_BOLD, size: 7.2, color: writer.theme.muted });
  writer.text(value, { size: 9.5 });
  writer.moveDown(5);
}

export async function renderInvoicePdf(input: InvoiceRenderInput): Promise<RenderedInvoice> {
  const reconciles = invoiceReconciles(input);
  const format = (minor: number): string => formatMoney(Math.round(minor), input.currency);
  const rateLabel = `${(input.taxRateBasisPoints / 100).toFixed(2)}%`;

  const writer = new PdfWriter({
    title: `Invoice ${input.invoiceNumber}`,
    subject: input.description,
    author: 'Ravelyth Talent',
    keywords: `invoice,${input.invoiceNumber}`,
    theme: INVOICE_THEME,
    margins: { top: 44, right: 44, bottom: 44, left: 44 },
    footer: `${input.invoiceNumber} · Ravelyth Talent`,
  });

  /* ------------------------------------------------------------- letterhead */

  writer.accentBar(5);
  writer.moveDown(14);

  const headingTop = writer.y;
  writer.text('Ravelyth Talent', { font: PDF_FONT_SERIF_BOLD, size: 17, color: writer.theme.accent });
  writer.text('Tax invoice', { size: 9, color: writer.theme.muted });

  // The invoice number shares the letterhead band: it is the second thing a
  // reader looks for, and putting it on its own line wastes the page.
  writer.doc
    .font(PDF_FONT_BOLD)
    .fontSize(15)
    .fillColor(writer.theme.accent)
    .text(input.invoiceNumber, writer.left + writer.width * 0.5, headingTop, {
      width: writer.width * 0.5,
      align: 'right',
    });
  writer.text(`Issued ${formatDate(input.issuedAt.toISOString())}`, {
    size: 9,
    color: writer.theme.muted,
    align: 'right',
  });

  writer.doc.y = Math.max(writer.y, headingTop + 30) + 4;
  writer.rule(writer.theme.rule, 0.75);
  writer.moveDown(18);

  /* ------------------------------------------------- bill-to / document meta */

  const billTo: Array<[string, string]> = [
    ['Billed to', input.customerName],
    ['Email', input.customerEmail],
  ];
  if (input.customerAddress) billTo.push(['Address', input.customerAddress]);
  if (input.customerGstin) billTo.push(['GSTIN', input.customerGstin]);
  if (input.placeOfSupply) billTo.push(['Place of supply', input.placeOfSupply]);

  const meta: Array<[string, string]> = [
    ['Status', input.status.replace(/_/g, ' ')],
    ['Description', input.description],
  ];
  if (input.billingPeriod) meta.push(['Billing period', input.billingPeriod]);
  if (input.periodStart && input.periodEnd) {
    meta.push(['Period', `${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`]);
  }
  if (input.paidAt) meta.push(['Paid on', formatDate(input.paidAt.toISOString())]);
  if (input.paymentReference) meta.push(['Payment reference', input.paymentReference]);

  const gap = 24;
  const columnWidth = (writer.width - gap) / 2;

  // The two blocks are laid out independently; the cursor is then placed below
  // whichever ran longer, so a long description cannot overlap the bill-to block.
  writer.withRegion(writer.left, columnWidth, null, () => {
    for (const [label, value] of billTo) detailPair(writer, label, value);
  });
  const billToBottom = writer.y;

  writer.withRegion(writer.left + columnWidth + gap, columnWidth, null, () => {
    for (const [label, value] of meta) detailPair(writer, label, value);
  });

  writer.doc.y = Math.max(billToBottom, writer.y) + 8;
  writer.moveDown(14);

  /* ----------------------------------------------------------------- items */

  writer.sectionHeading('Items');
  writer.table(
    [
      { header: 'Description', width: 0.54 },
      { header: 'Qty', width: 0.1, align: 'right' },
      { header: 'Unit price', width: 0.18, align: 'right' },
      { header: 'Amount', width: 0.18, align: 'right' },
    ],
    input.lines.map((line) => [
      line.description,
      String(line.quantity),
      format(line.unitAmountMinor),
      format(line.amountMinor),
    ])
  );
  writer.moveDown(18);

  /* ---------------------------------------------------------------- totals */

  const totalsWidth = Math.min(writer.width * 0.46, 260);
  const totalsBottom = (() => {
    const start = writer.y;
    writer.withRegion(writer.right - totalsWidth, totalsWidth, null, () => {
      writer.definitionRow(
        input.taxRateBasisPoints > 0 ? 'Subtotal (excl. tax)' : 'Subtotal',
        format(input.subtotalMinor),
        { size: 10 }
      );
      if (input.taxRateBasisPoints > 0) {
        writer.definitionRow(`Tax @ ${rateLabel}`, format(input.taxMinor), { size: 10 });
      }
      writer.moveDown(6);
      writer.highlightRow('Total paid', format(input.totalMinor), { size: 12 });
      writer.moveDown(3);
      writer.text(`All amounts include tax where applicable (${input.currency}).`, {
        size: 7.8,
        color: writer.theme.muted,
        align: 'right',
      });
    });
    return Math.max(writer.y, start);
  })();

  /* ----------------------------------------------------------------- notes */

  const notes: string[] = [];
  if (!reconciles) {
    notes.push(
      'The line items above do not sum to the total shown. Please contact support ' +
        `with invoice number ${input.invoiceNumber} before making payment.`
    );
  }
  if (input.notes) notes.push(input.notes);

  if (notes.length > 0) {
    writer.doc.y = totalsBottom + 12;
    for (const note of notes) {
      writer.callout(note, {
        size: 8.5,
        color: reconciles ? writer.theme.accent : 'b91c1c',
      });
      writer.moveDown(6);
    }
  }

  const body = await writer.finish();
  return { body, reconciles };
}
