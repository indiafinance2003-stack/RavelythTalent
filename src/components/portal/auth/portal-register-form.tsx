'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { portalPost } from '@/lib/portal-client/client';
import { formatApiError } from '@/lib/client/api';
import { Alert, Button, Field, inputClass } from '@/components/portal/ui';

/**
 * Portal registration.
 *
 * Sends the fields the backend actually requires, including `acceptTerms` and the
 * per-purpose `consents` object. The backend REFUSES a registration that has not
 * affirmatively accepted, so this is not decorative.
 *
 * Consent handling is deliberately honest:
 *  - `jobApplication` is required for a candidate because applying is impossible
 *    without it, so pretending it is optional would strand the account;
 *  - `resumeStorage` is required to upload a resume, and the form says so;
 *  - `marketing` is strictly opt-in, starts UNCHECKED, and is never pre-ticked.
 *    Leaving it blank records no marketing consent at all.
 */

type AccountType = 'candidate' | 'employer';

interface RegistrationResult {
  user: { id: string; email: string; name: string; role: string };
  verification: { requested: boolean; emailDelivered: boolean };
}

export function PortalRegisterForm(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = useMemo<AccountType>(() => {
    return searchParams.get('type') === 'employer' ? 'employer' : 'candidate';
  }, [searchParams]);

  const [accountType, setAccountType] = useState<AccountType>(initial);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [companyLocation, setCompanyLocation] = useState('');

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [jobApplication, setJobApplication] = useState(true);
  const [resumeStorage, setResumeStorage] = useState(true);
  // Marketing is opt-in and therefore starts false. It is never pre-selected.
  const [marketing, setMarketing] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email address.';
    if (password.length < 10) next.password = 'Use at least 10 characters.';
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (!acceptTerms) next.acceptTerms = 'You must accept the terms and privacy policy.';
    if (accountType === 'employer' && companyName.trim().length === 0) {
      next.companyName = 'Enter your company name.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await portalPost<RegistrationResult>('/api/portal/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        confirmPassword,
        accountType,
        // Required by the backend; never defaulted to true.
        acceptTerms: true,
        consents: {
          // Only an employer creating a candidate-shaped account needs these.
          ...(accountType === 'candidate'
            ? { jobApplication, resumeStorage, marketing }
            : {}),
        },
        ...(accountType === 'employer'
          ? {
              company: {
                name: companyName.trim(),
                website: companyWebsite.trim() || undefined,
                industry: companyIndustry.trim() || undefined,
                companySize: companySize.trim() || undefined,
                location: companyLocation.trim() || undefined,
              },
            }
          : {}),
      });

      // Only navigate once the account genuinely exists.
      const destination = result.user.role === 'employer' ? '/employer' : '/candidate';
      router.push(`${destination}?welcome=1`);
      router.refresh();
    } catch (caught) {
      setError(formatApiError(caught));
      setLoading(false);
    }
  }

  const isCandidate = accountType === 'candidate';

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error ? <Alert kind="error">{error}</Alert> : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-300">I am joining as</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: 'candidate', label: 'A candidate', hint: 'I am looking for a role.' },
              { value: 'employer', label: 'An employer or agency', hint: 'I want to hire talent.' },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                accountType === option.value
                  ? 'border-accent bg-accent-tint'
                  : 'border-line bg-paper hover:border-slate-600'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="accountType"
                  value={option.value}
                  checked={accountType === option.value}
                  onChange={() => setAccountType(option.value)}
                  className="h-4 w-4 accent-[#2563eb]"
                />
                <span className="text-sm font-medium text-ink">{option.label}</span>
              </span>
              <span className="mt-1 block text-xs text-slate-400">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Full name" htmlFor="reg-name" error={fieldErrors.name}>
        <input
          id="reg-name"
          name="name"
          autoComplete="name"
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      <Field label="Email address" htmlFor="reg-email" error={fieldErrors.email}>
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="reg-password"
        hint="At least 10 characters."
        error={fieldErrors.password}
      >
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field label="Confirm password" htmlFor="reg-confirm" error={fieldErrors.confirmPassword}>
        <input
          id="reg-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </Field>

      {!isCandidate ? (
        <fieldset className="space-y-4 rounded-lg border border-line bg-paper p-4">
          <legend className="px-1 text-sm font-medium text-slate-300">Your company</legend>
          <p className="text-xs text-slate-400">
            If you are a recruitment agency or staffing company, register here as an employer and ask our
            team to switch your account to a recruitment agency. That unlocks posting on behalf of
            authorised client companies.
          </p>

          <Field label="Company name" htmlFor="reg-company" error={fieldErrors.companyName}>
            <input
              id="reg-company"
              className={inputClass}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website (optional)" htmlFor="reg-company-web">
              <input
                id="reg-company-web"
                type="url"
                className={inputClass}
                value={companyWebsite}
                onChange={(event) => setCompanyWebsite(event.target.value)}
                placeholder="https://"
              />
            </Field>
            <Field label="Industry (optional)" htmlFor="reg-company-industry">
              <input
                id="reg-company-industry"
                className={inputClass}
                value={companyIndustry}
                onChange={(event) => setCompanyIndustry(event.target.value)}
              />
            </Field>
            <Field label="Company size (optional)" htmlFor="reg-company-size">
              <input
                id="reg-company-size"
                className={inputClass}
                value={companySize}
                onChange={(event) => setCompanySize(event.target.value)}
                placeholder="11-50"
              />
            </Field>
            <Field label="Location (optional)" htmlFor="reg-company-location">
              <input
                id="reg-company-location"
                className={inputClass}
                value={companyLocation}
                onChange={(event) => setCompanyLocation(event.target.value)}
              />
            </Field>
          </div>

          <p className="text-xs text-slate-500">
            New companies are created as <strong className="text-slate-400">pending verification</strong>.
            Only a Ravelyth administrator can verify a company.
          </p>
        </fieldset>
      ) : null}

      <fieldset className="space-y-3 rounded-lg border border-line bg-paper p-4">
        <legend className="px-1 text-sm font-medium text-slate-300">Consent and privacy</legend>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
            className="mt-1 h-4 w-4 accent-[#2563eb]"
          />
          <span className="text-sm text-slate-300">
            I accept the{' '}
            <Link href="/legal/terms" className="text-accent-soft underline">
              Terms and Conditions
            </Link>{' '}
            and the{' '}
            <Link href="/legal/privacy" className="text-accent-soft underline">
              Privacy Policy
            </Link>
            . <span className="text-red-300">*</span>
          </span>
        </label>
        {fieldErrors.acceptTerms ? (
          <p className="text-xs text-red-300" role="alert">
            {fieldErrors.acceptTerms}
          </p>
        ) : null}

        {isCandidate ? (
          <>
            <p className="text-xs text-slate-400">
              Ravelyth Talent records consent separately for each purpose, so you can withdraw one without
              affecting the others. Read the{' '}
              <Link href="/legal/candidate-consent" className="text-accent-soft underline">
                Candidate Consent and Data Use notice
              </Link>
              .
            </p>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={jobApplication}
                onChange={(event) => setJobApplication(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-slate-300">
                I consent to Ravelyth Talent and the employer I apply to processing my profile, resume and
                application data in order to assess me for roles.{' '}
                <span className="text-red-300">*</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={resumeStorage}
                onChange={(event) => setResumeStorage(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-slate-300">
                I consent to Ravelyth Talent storing my résumé and its versions so I can attach it to
                applications. Resumes stay private until I apply with them.
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-slate-300">
                Send me occasional emails about new roles and career tips. This is optional and is{' '}
                <strong className="text-slate-200">off by default</strong>.
              </span>
            </label>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            By registering you agree that Ravelyth Talent may contact you about your company account and any
            postings you submit. See the{' '}
            <Link href="/legal/employer-terms" className="text-accent-soft underline">
              Employer Terms
            </Link>{' '}
            and the{' '}
            <Link href="/legal/job-posting-policy" className="text-accent-soft underline">
              Job Posting Policy
            </Link>
            .
          </p>
        )}
      </fieldset>

      <Button type="submit" loading={loading} className="w-full">
        Create account
      </Button>

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="text-accent-soft hover:text-accent">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs text-slate-500">
        Need an account only for the DNS tools?{' '}
        <Link href="/register/account" className="underline hover:text-slate-400">
          Create a tools account
        </Link>
      </p>
    </form>
  );
}
