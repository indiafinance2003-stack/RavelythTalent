import type { ReactNode } from 'react';
import { PortalShell } from '@/components/portal/portal-shell';

/**
 * Employer and recruitment agency area.
 *
 * Both account kinds share a dashboard because they share a company: an agency's
 * jobs, credits and pipeline live on the same company record. Where they differ
 * (client authorisation, posting on a client's behalf) the pages themselves
 * branch on `companyType` returned by the API, rather than merging permissions.
 */
export default function EmployerLayout({ children }: { children: ReactNode }): React.ReactElement {
  return <PortalShell allowed={['employer']}>{children}</PortalShell>;
}
