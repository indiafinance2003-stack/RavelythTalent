'use client';

import { useState } from 'react';
import { useAsync } from '@/lib/portal-client/use-async';
import { portalGet } from '@/lib/portal-client/client';
import type { ProfileResponse } from '@/lib/portal-client/types';
import { completionLabel } from '@/lib/portal-client/format';
import {
  Card,
  CardHeader,
  ErrorState,
  LoadingState,
  Meter,
  PageHeader,
} from '@/components/portal/ui';
import { ProfileBasicsForm } from '@/components/portal/candidate/profile-basics-form';
import { ProfileSections } from '@/components/portal/candidate/profile-sections';
import { PreferencesForm } from '@/components/portal/candidate/preferences-form';

/**
 * Candidate profile: personal details, structured sections and job preferences.
 *
 * The completion meter is rendered from the server's own score. After every save
 * the response replaces local state, so the number shown is always the one the
 * backend computed from real data rather than a guess made in the browser.
 */
export function CandidateProfilePage(): React.ReactElement {
  const profile = useAsync(
    () => portalGet<ProfileResponse>('/api/portal/candidate/profile'),
    []
  );
  const [live, setLive] = useState<ProfileResponse | null>(null);

  const current = live ?? profile.data;

  if (profile.loading && !current) {
    return <LoadingState label="Loading your profile…" />;
  }
  if (profile.error && !current) {
    return <ErrorState message={profile.error} onRetry={profile.reload} />;
  }
  if (!current) {
    return <ErrorState message="Your profile could not be loaded." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidate profile"
        title="Your profile"
        description="Everything here is visible to employers only according to the visibility setting you choose."
      />

      <Card>
        <CardHeader
          title="Profile strength"
          description="Calculated by Ravelyth from your real profile data, never from what the browser thinks you filled in."
        />
        <div className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Completion</span>
            <span className="font-medium text-ink">{current.completion.percentage}%</span>
          </div>
          <div className="mt-2">
            <Meter
              value={current.completion.percentage}
              max={100}
              label="Profile completion"
              tone={current.completion.percentage >= 80 ? 'bg-emerald-500' : 'bg-accent'}
            />
          </div>
          {current.completion.missing.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-2">
              {current.completion.missing.map((field) => (
                <li
                  key={field}
                  className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/40"
                >
                  {completionLabel(field)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-emerald-300">
              Your profile is complete. Nothing further is required.
            </p>
          )}
        </div>
      </Card>

      <ProfileBasicsForm initial={current.profile} onSaved={setLive} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Experience and skills</h2>
        <ProfileSections />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Job preferences</h2>
        <PreferencesForm />
      </div>
    </div>
  );
}
