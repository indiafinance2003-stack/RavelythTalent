import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND,
  renderApplicationSubmittedEmail,
  renderEmailVerificationEmail,
  renderJobApprovedEmail,
  renderJobExpiringEmail,
  renderJobRejectedEmail,
  renderNewApplicationEmail,
  renderApplicationStatusChangedEmail,
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
  renderPaymentConfirmationEmail,
  renderSecurityAlertEmail,
} from '@/lib/email/transactional/portal';
import { sendApplicationSubmitted, sendJobApproved, sendSecurityAlert } from '@/lib/email/transactional/dispatch';
import { registerEmailProvider } from '@/lib/email/transactional/provider';
import { NOTIFICATION_TYPES } from '@/lib/db/schema';
import type { EmailProvider, EmailSendInput } from '@/lib/email/transactional/types';

/**
 * Notification and email event coverage (test items 66-70).
 *
 * The content assertions matter as much as the sending: a template that leaks a
 * token, a password or unescaped user input would be a real disclosure bug.
 */

/** Captures what would be sent, without a provider. */
function capturingProvider() {
  const sent: EmailSendInput[] = [];
  const provider: EmailProvider = {
    name: `capture-${sent.length}-${Math.random()}`,
    async send(input) {
      sent.push(input);
    },
  };
  return { sent, provider };
}

describe('transactional email templates', () => {
  it('renders every required event with a subject, text and HTML body', () => {
    const events = [
      renderPasswordResetEmail({ recipientName: 'A', resetUrl: 'https://x/reset?token=abc', expiresInMinutes: 30 }),
      renderEmailVerificationEmail({ recipientName: 'A', verificationUrl: 'https://x/verify?token=abc', expiresInHours: 24 }),
      renderPasswordChangedEmail({ recipientName: 'A', changedAtIso: '2024-01-01T00:00:00Z' }),
      renderApplicationSubmittedEmail({ candidateName: 'A', jobTitle: 'Dev', companyName: 'Co' }),
      renderNewApplicationEmail({ employerName: 'A', candidateName: 'B', jobTitle: 'Dev', dashboardPath: '/x' }),
      renderApplicationStatusChangedEmail({ candidateName: 'A', jobTitle: 'Dev', companyName: 'Co', statusLabel: 'Shortlisted' }),
      renderJobApprovedEmail({ employerName: 'A', jobTitle: 'Dev', dashboardPath: '/x' }),
      renderJobRejectedEmail({ employerName: 'A', jobTitle: 'Dev', rejectionReason: 'Fix the band', dashboardPath: '/x' }),
      renderJobExpiringEmail({ employerName: 'A', jobTitle: 'Dev', expiresAtIso: 'soon', dashboardPath: '/x' }),
      renderPaymentConfirmationEmail({ recipientName: 'A', orderNumber: 'RVLY-1', amountLabel: '₹990' }),
      renderSecurityAlertEmail({ recipientName: 'A', eventDescription: 'New sign-in', occurredAtIso: 'now' }),
    ];

    for (const event of events) {
      expect(event.subject.length).toBeGreaterThan(0);
      expect(event.text.length).toBeGreaterThan(0);
      expect(event.html).toContain('<!DOCTYPE html>');
      expect(event.html).toContain('</html>');
    }
  });

  it('never renders a bare token, only the full link', () => {
    const url = 'https://ravelyth.example/reset-password?token=SECRETTOKENVALUE123';
    const reset = renderPasswordResetEmail({ recipientName: 'A', resetUrl: url, expiresInMinutes: 30 });

    // The token appears only as part of the link, never as a standalone field.
    expect(reset.text).toContain(url);
    expect(reset.text).not.toMatch(/token:\s*SECRETTOKENVALUE123/);
  });

  it('never includes a password in any template', () => {
    const bodies = [
      renderPasswordChangedEmail({ recipientName: 'A', changedAtIso: 'now' }).text,
      renderPasswordResetEmail({ recipientName: 'A', resetUrl: 'https://x?t=1', expiresInMinutes: 30 }).text,
      renderEmailVerificationEmail({ recipientName: 'A', verificationUrl: 'https://x?t=1', expiresInHours: 24 }).text,
      renderSecurityAlertEmail({ recipientName: 'A', eventDescription: 'x', occurredAtIso: 'now' }).text,
    ];
    for (const body of bodies) {
      // Assert on an ACTUAL credential disclosure rather than the word
      // 'password', which legitimately appears in instructional prose.
      // A real leak puts a VALUE on the same line as the label.
      for (const line of body.split('\n')) {
        if (/password\s*:/i.test(line)) {
          expect(line.replace(/password\s*:\s*/i, '')).not.toMatch(/^[A-Za-z0-9!@#$%^&*_-]{4,}/);
        }
      }
      expect(body).not.toMatch(/your (new |current )?password is [A-Za-z0-9]/i);
    }
  });

  it('uses the configured brand in the HTML body', () => {
    const branded = renderJobApprovedEmail({
      employerName: 'A',
      jobTitle: 'Dev',
      dashboardPath: '/x',
      context: { brand: 'Acme Careers' },
    });

    // The brand is rendered in the shared layout, not baked into the subject.
    expect(branded.html).toContain('Acme Careers');
  });

  it('falls back to the default brand when none is configured', () => {
    const unbranded = renderJobApprovedEmail({
      employerName: 'A',
      jobTitle: 'Dev',
      dashboardPath: '/x',
    });

    // The default brand comes from the layout, so the body must still be branded.
    expect(unbranded.html).toContain(DEFAULT_BRAND);
  });

  it('escapes a hostile brand name', () => {
    const hostile = renderJobApprovedEmail({
      employerName: 'A',
      jobTitle: 'Dev',
      dashboardPath: '/x',
      context: { brand: '<img src=x onerror=alert(1)>' },
    });

    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).toContain('&lt;img');
  });
});

describe('email dispatch', () => {
  it('sends through the injected provider', async () => {
    const { sent, provider } = capturingProvider();

    const result = await sendApplicationSubmitted(
      { to: 'candidate@example.com', candidateName: 'Jane', jobTitle: 'Dev', companyName: 'Co' },
      { provider }
    );

    expect(result.delivered).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('candidate@example.com');
    expect(sent[0].subject).toContain('Dev');
  });

  it('reports delivered=false rather than pretending when no provider exists', async () => {
    const result = await sendJobApproved(
      { to: 'x@example.com', employerName: 'A', jobTitle: 'Dev', dashboardPath: '/x' },
      { provider: undefined }
    );

    // No provider is configured in tests, so delivery is honestly reported false.
    expect(result.delivered).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('reports a failure without throwing', async () => {
    const failing: EmailProvider = {
      name: 'failing',
      async send() {
        throw new Error('smtp down');
      },
    };

    const result = await sendSecurityAlert(
      { to: 'x@example.com', recipientName: 'A', eventDescription: 'e', occurredAtIso: 'now' },
      { provider: failing }
    );

    // A mail outage must not break the business operation that triggered it.
    expect(result.delivered).toBe(false);
  });

  it('never leaks the provider error into the result reason', async () => {
    const failing: EmailProvider = {
      name: 'failing-secret',
      async send() {
        throw new Error('smtp password=hunter2 rejected');
      },
    };

    const result = await sendSecurityAlert(
      { to: 'x@example.com', recipientName: 'A', eventDescription: 'e', occurredAtIso: 'now' },
      { provider: failing }
    );

    // Credentials from the transport must not surface to callers or logs.
    expect(result.reason ?? '').not.toContain('hunter2');
  });

  it('accepts a registered provider by name', () => {
    const provider: EmailProvider = { name: 'test-registered', async send() {} };
    expect(() => registerEmailProvider(provider)).not.toThrow();
  });
});

describe('in-app notification catalogue', () => {
  it('includes every portal notification type the UI needs', () => {
    for (const type of [
      'email_verification',
      'application_submitted',
      'application_status_changed',
      'new_application_received',
      'job_approved',
      'job_rejected',
      'job_expiring',
      'package_purchased',
      'premium_activated',
      'security_alert',
    ]) {
      expect(NOTIFICATION_TYPES).toContain(type as never);
    }
  });

  it('has no duplicate notification types', () => {
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
  });
});
