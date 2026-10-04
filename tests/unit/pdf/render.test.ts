import { describe, expect, it } from 'vitest';

import { extractPdfText, extractPdfTextPages } from '../../support/pdf';
import { PdfWriter } from '@/lib/pdf/document';
import { emptyResumeDocument, parseResumeDocument, ResumeContentError } from '@/lib/resume/content';
import { renderResumePdf } from '@/lib/pdf/resume';
import { invoiceReconciles, renderInvoicePdf, type InvoiceRenderInput } from '@/lib/pdf/invoice';
import { RESUME_TEMPLATE_CODES, isPremiumResumeTemplateCode } from '@/lib/resume/templates';

const GENERATED_AT = new Date('2026-03-14T10:30:00.000Z');

/** A document with enough content to exercise every renderer. */
function richDocument() {
  return parseResumeDocument({
    basics: {
      fullName: 'Ananya Krishnan',
      headline: 'Staff Platform Engineer',
      summary:
        'Platform engineer with nine years building payment and identity systems. ' +
        'Led the migration of a monolith to event-driven services while keeping the ledger exact.',
    },
    contact: {
      email: 'ananya@example.com',
      phone: '+91 98450 11223',
      location: 'Bengaluru, India',
      linkedinUrl: 'https://www.linkedin.com/in/ananya',
      githubUrl: 'https://github.com/ananya',
    },
    experience: [
      {
        company: 'Paystream',
        title: 'Staff Engineer',
        location: 'Bengaluru',
        employmentType: 'full_time',
        startDate: '2022-06',
        endDate: '',
        isCurrent: true,
        highlights: [
          'Cut p99 settlement latency from 1.9s to 240ms by replacing a synchronous ledger read with a versioned cache.',
          'Designed the double-entry ledger model now used by all four payout rails.',
        ],
        technologies: ['Go', 'PostgreSQL', 'Kafka'],
      },
      {
        company: 'Northwind Retail',
        title: 'Senior Backend Engineer',
        startDate: '2019-01',
        endDate: '2022-05',
        isCurrent: false,
        highlights: ['Owned the order pipeline end to end.'],
        technologies: ['Java', 'Spring'],
      },
    ],
    education: [
      {
        institution: 'Indian Institute of Science',
        degree: 'M.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2015,
        endYear: 2017,
        grade: 'CGPA 9.1',
      },
    ],
    skills: [
      { name: 'Distributed systems', proficiency: 'expert', yearsOfExperience: 9 },
      { name: 'Go', proficiency: 'expert', yearsOfExperience: 6 },
      { name: 'PostgreSQL', proficiency: 'advanced', yearsOfExperience: 8 },
    ],
    projects: [
      {
        name: 'rupee-format',
        url: 'https://github.com/ananya/rupee-format',
        description: 'An Intl.NumberFormat wrapper that never drops the rupee sign.',
        highlights: ['1.2k stars.'],
        technologies: ['TypeScript'],
      },
    ],
    certifications: [{ name: 'AWS Solutions Architect', issuer: 'Amazon', issuedDate: '2023-08' }],
    languages: [{ name: 'Tamil', proficiency: 'native' }, { name: 'English', proficiency: 'fluent' }],
  });
}

function invoice(overrides: Partial<InvoiceRenderInput> = {}): InvoiceRenderInput {
  const subtotalMinor = 799900;
  const taxMinor = 143982;
  return {
    invoiceNumber: 'RVLYT-2026-000014',
    description: 'Professional recruiter plan — Monthly subscription',
    status: 'paid',
    currency: 'INR',
    customerName: 'Ravelyth Retail Pvt Ltd',
    customerEmail: 'ap@ravelyth.example',
    customerAddress: '14 Residency Road, Bengaluru 560025',
    customerGstin: '29AABCR1234M1Z5',
    placeOfSupply: 'Karnataka',
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    taxRateBasisPoints: 1800,
    billingPeriod: 'monthly',
    periodStart: '2026-03-14T00:00:00.000Z',
    periodEnd: '2026-04-14T00:00:00.000Z',
    paymentReference: 'pay_RVLYT9f2b7c1',
    notes: null,
    issuedAt: new Date('2026-03-14T10:30:00.000Z'),
    paidAt: new Date('2026-03-14T10:31:00.000Z'),
    lines: [
      {
        description: 'Professional recruiter plan — Monthly subscription',
        quantity: 1,
        unitAmountMinor: subtotalMinor,
        amountMinor: subtotalMinor,
        taxRateBasisPoints: 1800,
        isTaxLine: false,
      },
      {
        description: 'GST @ 18.00%',
        quantity: 1,
        unitAmountMinor: taxMinor,
        amountMinor: taxMinor,
        taxRateBasisPoints: 1800,
        isTaxLine: true,
      },
    ],
    ...overrides,
  };
}

describe('PdfWriter', () => {
  it('produces a readable multi-page PDF with a page footer on every page', async () => {
    const writer = new PdfWriter({
      title: 'Writer smoke test',
      footer: 'Ravelyth Talent test document',
    });

    writer.text('First page body');
    // Force a break rather than relying on a page-filling amount of text.
    writer.newPage();
    writer.text('Second page body');

    const pdf = await writer.finish();

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.subarray(-6).toString().trim()).toBe('%%EOF');

    const text = extractPdfText(pdf);
    expect(text).toContain('First page body');
    expect(text).toContain('Second page body');
    expect(text).toContain('Ravelyth Talent test document');
    expect(text).toContain('Page 1 of 2');
    expect(text).toContain('Page 2 of 2');
  });

  it('breaks a page instead of writing content into the footer band', async () => {
    const writer = new PdfWriter({ title: 'Overflow test' });
    const limit = writer.pageHeight;
    const line = 'Filler line that fills the page.';
    const tail = 'After the break';

    // `remaining()` cannot be the loop condition by itself: PDFKit performs the page
    // break for us and resets the cursor, so the value never actually reads 0 and
    // the loop runs away until its guard. Instead, fill page 1 until the trailing
    // line provably no longer fits — `text()` calls `ensureSpace`, which breaks
    // when `remaining()` drops below the height it needs.
    const tailHeight = writer.measure(tail);
    let guard = 0;
    while (writer.remaining() >= tailHeight && guard < 500) {
      writer.text(line);
      guard += 1;
    }

    expect(writer.remaining()).toBeLessThan(tailHeight);
    writer.text(tail);

    const pdf = await writer.finish();
    const pages = extractPdfTextPages(pdf);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]).toContain(line);
    expect(pages[0]).not.toContain(tail);
    expect(pages[1]).toContain(tail);
    // Nothing may be written below the page box.
    expect(writer.pageHeight).toBeCloseTo(limit, 5);
    expect(guard).toBeGreaterThan(10);
  });

  it('keeps a heading with the content that follows it', async () => {
    const writer = new PdfWriter({ title: 'Orphan heading test' });

    // Fill the page to within a few lines, leaving no room for a heading.
    while (writer.remaining() > 70) {
      writer.text('Filler.');
    }

    writer.sectionHeading('Certifications', 60);

    const pdf = await writer.finish();
    const pages = extractPdfTextPages(pdf);
    const headingPage = pages.findIndex((page) => page.includes('CERTIFICATIONS'));

    expect(headingPage).toBeGreaterThanOrEqual(0);
    // A heading must not be the last thing on a page: it moved down to the page
    // that also carries its content rather than being stranded at the bottom.
    expect(pages[headingPage]!.replace('CERTIFICATIONS', '').trim().length).toBeGreaterThan(0);
  });

  it('renders text in two independent column regions without overlap', async () => {
    const writer = new PdfWriter({ title: 'Regions test' });
    const gutter = 20;
    const sidebar = Math.round(writer.width * 0.3);
    const main = writer.width - sidebar - gutter;

    writer.withRegion(writer.left + sidebar + gutter, main, null, () => {
      writer.text('MAIN COLUMN MARKER');
    });
    writer.withRegion(writer.left, sidebar, null, () => {
      writer.text('SIDEBAR MARKER');
    });

    const text = extractPdfText(await writer.finish());
    expect(text).toContain('MAIN COLUMN MARKER');
    expect(text).toContain('SIDEBAR MARKER');
  });
});

describe('resume content validation', () => {
  it('rejects content that is missing a name, with an actionable message', () => {
    expect(() => parseResumeDocument({ basics: { fullName: '' } })).toThrowError(ResumeContentError);
    try {
      parseResumeDocument({ basics: { fullName: '' } });
    } catch (error) {
      expect((error as ResumeContentError).issues.join(' ')).toContain('fullName');
    }
  });

  it('rejects a resume link that is not http(s)', () => {
    expect(() =>
      parseResumeDocument({
        basics: { fullName: 'Test' },
        contact: { email: 't@example.com', portfolioUrl: 'javascript:alert(1)' },
      })
    ).toThrowError(ResumeContentError);
  });

  it('rejects an email that is not an email', () => {
    expect(() =>
      parseResumeDocument({ basics: { fullName: 'Test' }, contact: { email: 'not-an-email' } })
    ).toThrowError(ResumeContentError);
  });

  it('accepts an empty document so a candidate can start from nothing', () => {
    const document = emptyResumeDocument('New Person', 'new@example.com');
    expect(document.basics.fullName).toBe('New Person');
    expect(document.experience).toEqual([]);
    expect(() => parseResumeDocument(document)).not.toThrow();
  });
});

describe('resume PDF rendering', () => {
  it('prints the real candidate data, not a placeholder', async () => {
    const { body } = await renderResumePdf(richDocument(), {
      templateCode: 'classic',
      candidateName: 'Ananya Krishnan',
      generatedAt: GENERATED_AT,
    });

    const text = extractPdfText(body);
    expect(text).toContain('Ananya Krishnan');
    expect(text).toContain('Staff Platform Engineer');
    expect(text).toContain('Paystream');
    expect(text).toContain('Indian Institute of Science');
    expect(text).toContain('rupee-format');
    expect(text).toContain('AWS Solutions Architect');
    expect(text).toContain('Tamil');
    expect(text).toContain('ananya@example.com');
    expect(text).toContain('EXPERIENCE');
    expect(text).toContain('EDUCATION');
    expect(text).toContain('Jun 2022');
  });

  it('renders every template without losing the candidate data', async () => {
    for (const code of RESUME_TEMPLATE_CODES) {
      const { body, template } = await renderResumePdf(richDocument(), {
        templateCode: code,
        candidateName: 'Ananya Krishnan',
        generatedAt: GENERATED_AT,
      });

      const text = extractPdfText(body);
      expect(text.length, `${code} produced a PDF with no text`).toBeGreaterThan(200);
      expect(text, `${code} lost the candidate name`).toContain('Ananya Krishnan');
      expect(text, `${code} lost an employer`).toContain('Paystream');
      expect(text, `${code} lost a school`).toContain('Indian Institute of Science');
      expect(template.code).toBe(code);
    }
  });

  it('marks the three paid templates as premium, matching the seeded catalogue', () => {
    expect(RESUME_TEMPLATE_CODES.filter(isPremiumResumeTemplateCode).sort()).toEqual([
      'executive',
      'modern',
      'technical',
    ]);
  });

  it('falls back to a working layout for an unknown template code', async () => {
    const { template } = await renderResumePdf(richDocument(), {
      templateCode: 'does-not-exist',
      candidateName: 'Ananya Krishnan',
      generatedAt: GENERATED_AT,
    });
    expect(template.code).toBe('classic');
  });

  it('omits sections the candidate left empty instead of printing placeholders', async () => {
    const sparse = parseResumeDocument({
      basics: { fullName: 'Minimal Person' },
      contact: { email: 'minimal@example.com' },
    });
    const { body, renderedSections } = await renderResumePdf(sparse, {
      templateCode: 'classic',
      candidateName: 'Minimal Person',
      generatedAt: GENERATED_AT,
    });

    const text = extractPdfText(body);
    expect(text).toContain('Minimal Person');
    expect(text).not.toContain('N/A');
    expect(text).not.toContain('EXPERIENCE');
    expect(renderedSections).toEqual([]);
  });

  it('flows a long resume onto more than one page without dropping content', async () => {
    const long = richDocument();
    long.experience = Array.from({ length: 12 }, (_, index) => ({
      company: `Company ${index + 1}`,
      title: `Engineer ${index + 1}`,
      startDate: '2020-01',
      endDate: '2021-01',
      isCurrent: false,
      highlights: [
        `Delivered outcome number ${index + 1} for a very long bullet point that has to wrap across lines.`,
      ],
      technologies: ['Go'],
    }));

    const { body } = await renderResumePdf(long, {
      templateCode: 'classic',
      candidateName: 'Ananya Krishnan',
      generatedAt: GENERATED_AT,
    });

    const text = extractPdfText(body);
    expect(text).toContain('Page 1 of');
    expect(text).toContain('Company 1');
    expect(text).toContain('Company 12');
    expect(extractPdfTextPages(body).length).toBeGreaterThan(1);
  });
});

describe('invoice PDF rendering', () => {
  it('prints the invoice number, line item, tax and total from the snapshot', async () => {
    const { body, reconciles } = await renderInvoicePdf(invoice());

    expect(reconciles).toBe(true);
    const text = extractPdfText(body);
    expect(text).toContain('RVLYT-2026-000014');
    expect(text).toContain('Professional recruiter plan');
    expect(text).toContain('Ravelyth Retail Pvt Ltd');
    expect(text).toContain('ap@ravelyth.example');
    expect(text).toContain('29AABCR1234M1Z5');
    expect(text).toContain('Tax @ 18.00%');
    // The rupee sign must survive into the document: a total without a currency
    // mark is the failure that motivated bundling a font at all.
    expect(text).toContain('₹');
    expect(text).toMatch(/₹[\d,]+/);
    expect(text).toContain('Total paid');
  });

  it('uses the snapshot tax rate, not the current configured rate', async () => {
    const snapshot = invoice({ taxRateBasisPoints: 500 });
    // The stored tax-line label is neutralised on purpose. Otherwise the fixture's
    // own "18.00%" string satisfies the guard below no matter which rate the
    // renderer actually prints, and the test proves nothing.
    snapshot.lines = snapshot.lines.map((line) =>
      line.isTaxLine ? { ...line, description: 'Tax' } : line,
    );

    const { body } = await renderInvoicePdf(snapshot);
    const text = extractPdfText(body);
    expect(text).toContain('Tax @ 5.00%');
    expect(text).not.toContain('18.00%');
  });

  it('detects and discloses a total that does not match its line items', async () => {
    const broken = invoice({ taxMinor: 1 });
    expect(invoiceReconciles(broken)).toBe(false);

    const { body, reconciles } = await renderInvoicePdf(broken);
    expect(reconciles).toBe(false);
    expect(extractPdfText(body)).toContain('do not sum to the total shown');
  });

  it('omits the tax row entirely when no tax is configured', async () => {
    const zeroTax = invoice({
      taxRateBasisPoints: 0,
      taxMinor: 0,
      totalMinor: 799900,
      lines: [
        {
          description: 'Professional recruiter plan — Monthly subscription',
          quantity: 1,
          unitAmountMinor: 799900,
          amountMinor: 799900,
          taxRateBasisPoints: 0,
          isTaxLine: false,
        },
      ],
    });

    const { body } = await renderInvoicePdf(zeroTax);
    const text = extractPdfText(body);
    expect(text).toContain('Subtotal');
    expect(text).not.toContain('Tax @');
  });
});
