import type { ReactNode } from 'react';
import { PortalShell } from '@/components/portal/portal-shell';

/**
 * Candidate area.
 *
 * `allowed` is a presentation guard only. The real authorisation is enforced by
 * every API route the pages call, so removing this prop could not grant access to
 * anything.
 */
export default function CandidateLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <PortalShell allowed={['candidate']}>{children}</PortalShell>;
}
