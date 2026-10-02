import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
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
    const clients = readSource('src', 'app', 'employer', 'company', 'clients', 'page.tsx');
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

