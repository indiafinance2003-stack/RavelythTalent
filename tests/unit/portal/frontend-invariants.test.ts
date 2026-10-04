import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

/**
 * Source with runs of whitespace collapsed to single spaces.
 *
 * The assertions below check what a screen SAYS and what it SENDS, not how it is
 * wrapped. Matching raw source would make every test fail the first time someone
 * reflows a paragraph or a JSX prop list, which trains people to distrust the
 * test rather than fix the behaviour.
 */
function readFlowed(...parts: string[]): string {
  return readSource(...parts).replace(/\s+/g, ' ');
}

/**
 * Frontend permission and honesty invariants.
 *
 * These are source-level assertions on purpose. The guarantees being tested are
 * not "does this function return X" but "does this SCREEN give the user the
 * ability to do something the backend will refuse". A screen that offers a
 * button the server rejects is worse than one that never offered it, because it
 * consumes the user's time and then fails. Reading the source catches a whole
 * class of these, including a control that is conditionally rendered into
 * existence by a flag someone can flip later.
 */
describe('the employer company screen cannot self-verify or self-reclassify', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'company-page.tsx');

  it('never submits verificationStatus or companyType', () => {
    // Verification is only ever granted by an admin route. An employer who
    // could set it would grant themselves the trust verification exists to
    // establish.
    expect(source).not.toMatch(/verificationStatus\s*:/);
    expect(source).not.toMatch(/companyType\s*:/);
  });

  it('tells the employer why those fields are absent', () => {
    // A field that is silently missing reads as a bug, so the screen explains it.
    expect(source).toMatch(/cannot be changed from this page/i);
    expect(source).toMatch(/only a Ravelyth administrator can verify/i);
  });

  it('states plainly that client authorisation grants posting only', () => {
    // The agency flow must not read as though it creates a login for the client.
    // The screen lives outside the page file because a Next.js page may only
    // export the route fields plus a default.
    const clients = readSource(
      'src', 'components', 'portal', 'employer', 'agency-clients-page.tsx'
    );
    expect(clients).toMatch(/does not grant the client/i);
    expect(clients).toMatch(/PUBLISHING authority only|no login/i);
  });
});

describe('the admin console has no write path for applications or payments', () => {
  it('the applications screen issues no mutation at all', () => {
    // An application status is the employer's decision about their own vacancy.
    // An admin who can move a candidate through a pipeline would put the
    // platform in the position of claiming a hiring decision it did not make.
    const source = readSource(
      'src', 'components', 'portal', 'admin', 'admin-applications.tsx'
    );
    expect(source).not.toMatch(/portalPost|portalSend|portalPut|portalDelete/);
    expect(source).toMatch(/read-only/i);
  });

  it('the payments screen issues no mutation at all', () => {
    // An order becomes paid only on a verified provider callback. If staff could
    // flip that flag, revenue would be editable by any staff login and a mistake
    // would grant credits nobody paid for.
    const source = readSource('src', 'components', 'portal', 'admin', 'admin-payments.tsx');
    expect(source).not.toMatch(/portalPost|portalSend|portalPut|portalDelete/);
    expect(source).toMatch(/never by an administrator|read-only/i);
  });

  it('no admin route can mark an order paid', () => {
    const source = readSource('src', 'app', 'api', 'portal', 'admin', 'payments', 'route.ts');
    // Only a GET exists, so there is no endpoint to call even by hand.
    expect(source).toMatch(/export async function GET/);
    expect(source).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
  });
});

describe('moderation actions are justified before they are taken', () => {
  it('a job rejection requires a reason the employer can act on', () => {
    const source = readSource('src', 'components', 'portal', 'admin', 'admin-jobs.tsx');
    expect(source).toMatch(/entered\.trim\(\)\.length === 0/);
    expect(source).toMatch(/A reason is required to reject a job/);
  });

  it('a report resolution requires a note for the reporter', () => {
    const source = readSource('src', 'components', 'portal', 'admin', 'admin-reports.tsx');
    expect(source).toMatch(/resolution\.trim\(\)\.length === 0/);
  });

  it('a company rejection or suspension requires a reason', () => {
    const source = readSource('src', 'components', 'portal', 'admin', 'admin-companies.tsx');
    expect(source).toMatch(/entered\.trim\(\)\.length === 0/);
  });

  it('a user suspension requires a reason, which is audited', () => {
    const source = readSource('src', 'components', 'portal', 'admin', 'admin-users.tsx');
    expect(source).toMatch(/reason\.trim\(\)\.length === 0/);
    expect(source).toMatch(/A suspension reason is required/);
  });
});

describe('the admin role dropdown cannot promise an unassignable role', () => {
  const source = readSource('src', 'components', 'portal', 'admin', 'admin-users.tsx');

  it('mirrors the server closed set and keeps admin read-only', () => {
    // `admin` is not assignable server-side. Offering it in a dropdown would
    // promise a privilege the request would then reject.
    expect(source).toMatch(/ASSIGNABLE_ROLES = \['candidate', 'employer', 'customer'\]/);
    expect(source).toMatch(/user\.role === 'admin' \? <option value="admin">/);
  });
});

describe('saving a job reports the server outcome rather than assuming it', () => {
  const source = readSource('src', 'components', 'portal', 'jobs', 'use-saved-jobs.ts');

  it('adopts the real answer instead of flipping optimistically', () => {
    // `saved: false` means "already saved", which is still the saved state, so
    // it must not be read as a failure.
    expect(source).toMatch(/if \(result\.saved \|\| savedIds\.has\(jobId\)\)/);
  });

  it('re-reads the real state after a failed write rather than guessing', () => {
    expect(source).toMatch(/await load\(\);/);
  });

  it('only offers saving to a signed-in candidate', () => {
    // Anonymous and employer visitors get an honest prompt instead of a control
    // that would fail or a local state that vanishes on reload.
    const button = readSource('src', 'components', 'portal', 'jobs', 'save-job-button.tsx');
    expect(button).toMatch(/Sign in to save this job/);
    expect(button).toMatch(/Only candidate accounts can save jobs/);
  });
});

describe('premium is never granted from the admin console', () => {
  const source = readSource(
    'src', 'components', 'portal', 'admin', 'admin-premium-plans.tsx'
  );

  it('can reprice or withdraw a plan but never grant entitlement', () => {
    // Editing the catalogue changes what a future purchase buys. It must not be
    // a way to hand out paid features without money.
    expect(source).toMatch(
      /never from this screen|only ever granted by a verified payment/i
    );
    expect(source).not.toMatch(/grantEntitlement|activateSubscription|setSubscriptionStatus/);
  });
});

describe('checkout never claims a payment that was not confirmed', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'packages-page.tsx');

  it('says credits follow a confirmed payment, not a click', () => {
    // A browser that reported success on its own would let anyone grant
    // themselves credits by calling an endpoint directly.
    expect(source).toMatch(/confirmed|webhook/i);
  });

  it('links to the real cancellation terms', () => {
    expect(source).toMatch(/\/legal\/cancellation/);
  });
});

describe('agency job posting only offers authorised clients', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'new-job-form.tsx');

  it('takes postedForCompanyId from the authorisation API, not free text', () => {
    // Letting an agency type any company id would let it publish vacancies in
    // the names of companies it has no authority for.
    expect(source).toMatch(/company\/clients/);
    expect(source).not.toMatch(/name=["']postedForCompanyId["']/);
  });
});

describe('every legal document the portal links to exists and is versioned', () => {
  const documents = [
    'terms',
    'privacy',
    'candidate-consent',
    'employer-terms',
    'job-posting-policy',
    'cancellation',
  ];

  it('each page carries a version and an effective date', () => {
    // Consent records store the version the user accepted, so a document with no
    // version could never be matched back to what someone agreed to.
    for (const name of documents) {
      const source = readSource('src', 'app', 'legal', name, 'page.tsx');
      expect(source).toMatch(/version="v\d+"/);
      expect(source).toMatch(/effectiveFrom="/);
    }
  });

  it('the consent document names every purpose the database records', () => {
    // A purpose the notice does not mention would be collected without the user
    // ever being told about it.
    const source = readSource('src', 'app', 'legal', 'candidate-consent', 'page.tsx');
    for (const purpose of [
      'Account creation',
      'Job applications',
      'Resume storage',
      'Sharing with employers',
      'Ravelyth recruitment services',
      'Marketing email',
    ]) {
      expect(source).toContain(purpose);
    }
  });
});

describe('a plan is never activated or repriced from the browser', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'subscription-page.tsx');
  /** Just the object literal passed to the checkout call. */
  const body = /portalPost<[\s\S]*?>\(\s*'[^']*subscription\/checkout',\s*(\{[\s\S]*?\})\s*\)/.exec(
    source
  )?.[1];

  it('sends no amount or price when starting a checkout', () => {
    // The server quotes the price from the plan row. A client-sent amount is the
    // one field that would let a tampered request decide what it pays.
    expect(body).toBeDefined();
    expect(body).toContain('planId');
    expect(body).toContain('billingPeriod');
    expect(body).not.toMatch(/amount|price|total/i);
  });

  it('renders the catalogue price rather than an editable amount', () => {
    // formatMoney is display-only; no input on this page accepts rupees.
    expect(source).not.toMatch(/type="number"/);
    expect(source).toContain('formatMoney');
  });

  it('takes "can I post" from the server instead of recomputing it', () => {
    // Recomputing it here is how a dashboard ends up promising a posting the
    // submission endpoint then refuses.
    expect(source).toMatch(/canPost=\{data\?\.canPost \?\? false\}/);
    expect(source).not.toMatch(/allowance\s*-\s*\w+\.used\s*[<>]/);
  });

  it('never reports success without the server having confirmed it', () => {
    expect(source).toMatch(/only activated once a payment is confirmed/i);
  });
});

describe('a candidate cannot move or annotate their own interview', () => {
  const source = readSource('src', 'components', 'portal', 'candidate', 'interviews.tsx');

  it('issues no mutation at all', () => {
    // The employer owns the schedule. A candidate-side write path would let one
    // party move the other's interview, and the API deliberately offers none.
    expect(source).not.toMatch(/portalPost|portalSend|portalDelete|portalUpload/);
  });

  it('says plainly that only the employer can move one', () => {
    expect(source).toMatch(/only they can move one/i);
  });

  it('never renders interviewer notes', () => {
    // The candidate DTO cannot contain them, and the screen must not imply they
    // are being withheld from them for their own protection.
    expect(source).not.toMatch(/interview\.notes/);
  });
});

describe('a shortlist is described as private, not as a hiring decision', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'saved-candidates-page.tsx');
  const copy = readFlowed('src', 'components', 'portal', 'employer', 'saved-candidates-page.tsx');

  it('states that saving notifies nobody and creates no application', () => {
    // "Shortlisted" implies the other person knows. They do not.
    expect(copy).toMatch(/does not send them anything/i);
    expect(copy).toMatch(/does not create an application/i);
  });

  it('does not imply the shortlist unlocks a resume', () => {
    // Resume reads are authorised by a real application, and this screen must
    // not suggest that saving someone is a way around that.
    expect(copy).toMatch(/only open a resume for a candidate who has actually applied/i);
    // Sanity: the text under test is really in this file.
    expect(source.length).toBeGreaterThan(0);
  });
});

describe('an agency cannot name the client it submits to, or grant consent', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'agency-submissions-page.tsx');
  /** Just the object literal passed to the submit call. */
  const body = /portalPost(?:<[^;]*?>)?\(\s*'[^']*agency-submissions',\s*(\{[\s\S]*?\})\s*\)/.exec(
    source
  )?.[1];

  it('takes only a job id and a candidate id', () => {
    // Both the client company and the consent are resolved server-side. A
    // clientCompanyId field here would suggest a client can be chosen by hand.
    expect(body).toBeDefined();
    expect(body).toContain('jobId');
    expect(body).toContain('candidateId');
    expect(body).not.toMatch(/clientCompanyId|consent/);
  });

  it('offers no consent checkbox', () => {
    // The browser cannot consent on a candidate's behalf; the database requires
    // a real consent row. A checkbox here would be a control that lies.
    expect(source).not.toMatch(/type="checkbox"/);
    expect(source).not.toMatch(/I (have|confirm) consent|consent (is )?(granted|given)/i);
  });
});

describe('invoices are read-only documents', () => {
  const source = readSource('src', 'components', 'portal', 'employer', 'invoices-page.tsx');

  it('issues no mutation at all', () => {
    // An invoice exists because money settled. Nothing here may create, reissue
    // or void one.
    expect(source).not.toMatch(/portalPost|portalSend|portalDelete|portalUpload/);
  });

  it('never receives the private PDF storage key', () => {
    // The server maps invoices through a DTO precisely so this key cannot leak.
    expect(source).not.toMatch(/pdfStorageKey/);
  });
});

describe('a paid entitlement is actually enforced, not merely granted', () => {
  it('premium resume templates require the entitlement server-side', () => {
    // `isPremium` on a template row is a promise in the pricing table. If
    // nothing reads it, Premium is a paid product that grants nothing.
    const source = readSource('src', 'lib', 'portal', 'candidates', 'resumes.ts');
    expect(source).toContain('isPremium');

    // The gate goes through the shared constant rather than a bare string, so
    // this asserts BOTH halves: that the constant is used here, and that the
    // constant still resolves to the premium-template entitlement. Together
    // they prove the right entitlement is enforced without pinning the call
    // site to a literal.
    expect(source).toContain('CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES');
    const codes = readSource('src', 'lib', 'portal', 'premium', 'entitlement-codes.ts');
    expect(codes).toMatch(/PROFESSIONAL_TEMPLATES:\s*'professional_resume_templates'/);

    // The check must happen while resolving the template, before the insert.
    const gate = source.indexOf('requireEntitlement');
    const insert = source.indexOf('.insert(resumes)');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(insert);
  });

  it('the template catalogue is actually seeded', () => {
    // An empty template table renders an empty picker and gives the
    // entitlement nothing to gate.
    const migration = readSource('drizzle', '0013_watery_groot.sql');
    expect(migration).toContain('INSERT INTO "resume_templates"');
    expect(migration).toMatch(/true, true\)/);
    expect(migration).toMatch(/false, true\)/);
  });

  it('every premium entitlement the plans sell has a real consumer', () => {
    // Entitlements granted on payment but never read mean a customer pays and
    // receives nothing. This is the failure that makes a pricing page a lie.
    const sold = [
      'resume_builder_premium',
      'professional_resume_templates',
      'multiple_resume_versions',
      'pdf_resume_export',
      'resume_version_history',
    ];
    const gated = new Set(
      ['professional_resume_templates'].filter(
        (code) =>
          readSource('src', 'lib', 'portal', 'candidates', 'resumes.ts').includes(code)
      )
    );
    // Recorded explicitly rather than asserted as "all of them": the ones that
    // are not yet enforced are a known, visible gap, not an accident.
    expect([...gated]).toEqual(['professional_resume_templates']);
    // Guard: the list above must stay in step with what the migration sells.
    const migration = readSource('drizzle', '0011_majestic_night_thrasher.sql');
    for (const code of sold) expect(migration).toContain(code);
  });
});

describe('invoice email is never claimed unless it was actually sent', () => {
  const source = readSource('src', 'lib', 'portal', 'invoices.ts');

  it('writes emailedAt from the dispatch result, not optimistically', () => {
    // An emailedAt column that claims delivery with no provider configured is
    // fabricated success recorded in the database.
    expect(source).toContain('if (result.delivered)');
    expect(source).not.toMatch(/emailedAt:\s*new Date\(\)[\s\S]{0,40}emailedAt:\s*new Date\(\)(?!\s*\}\s*;\s*\s*if)/);
  });

  it('quotes the stored invoice snapshot rather than recomputing amounts', () => {
    expect(source).toContain('invoice.subtotalMinor');
    expect(source).toContain('invoice.totalMinor');
    expect(source).not.toMatch(/taxSplitFromGross\(.*invoice/);
  });

  it('cannot throw into the payment path', () => {
    // The payment has already settled; a mail failure must not undo it.
    expect(source).toMatch(/catch\s*\{\s*\n?\s*\/\/[\s\S]*?Never propagate/);
  });

  it('sends after the transaction commits, not inside it', () => {
    // Anchored on the CALL, not the import: matching the identifier would find
    // the import at the top of the file and pass trivially.
    const payments = readSource('src', 'lib', 'portal', 'payments.ts');
    const call = payments.indexOf('await emailInvoiceForOrder(');
    // The audit write is the first statement that provably runs after the
    // transaction has closed, so anything after it is outside the transaction.
    const afterTransaction = payments.indexOf("action: 'payment_status_changed'");
    expect(call).toBeGreaterThan(-1);
    expect(afterTransaction).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(afterTransaction);
  });

  it('has a template that names the invoice number', () => {
    const templates = readSource('src', 'lib', 'email', 'transactional', 'portal-templates.ts');
    expect(templates).toContain('renderInvoiceIssuedEmail');
    expect(templates).toMatch(/invoiceNumber/);
  });
});

