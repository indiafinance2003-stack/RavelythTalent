import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getSessionUser, type AuthenticatedUser } from '@/lib/auth/session';
import { currentPortalUser } from '@/lib/portal/auth-context';

const siteUrl = process.env.APP_URL || 'https://ravelyth.in';

export const viewport: Viewport = {
  themeColor: '#0b1220',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // Ravelyth Talent is the only public product; every page sets its own title
    // through this template, and the default describes the job portal a visitor
    // actually lands on.
    default: 'Ravelyth Talent — Find your next role',
    template: '%s | Ravelyth Talent',
  },
  description:
    'Search live vacancies on Ravelyth Talent by keyword, location, experience, salary, employment type and work mode. Build a profile and resume, apply in one click, and let employers find you.',
  applicationName: 'Ravelyth Talent',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Ravelyth Talent — Find your next role',
    description:
      'Search live vacancies, build a profile and resume, and apply directly to employers hiring now.',
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Ravelyth Talent',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Ravelyth Talent job portal',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ravelyth Talent — Find your next role',
    description:
      'Search live vacancies, build a profile and resume, and apply directly to employers hiring now.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  // Resolves the signed-in user from the HttpOnly session cookie so the
  // header and footer can render accurate account controls. Public tools are
  // unaffected when no session exists (or when the database is unavailable).
  let user: AuthenticatedUser | null = null;
  let role: string | undefined;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }

  // The role is re-read from the database rather than taken from the session
  // row, so a suspension or a role change is reflected in the header
  // immediately instead of on the next sign-in. A failure here must not take
  // the whole page down, so it degrades to "no role" rather than throwing.
  try {
    const portalUser = await currentPortalUser();
    role = portalUser?.role;
  } catch {
    role = undefined;
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-paper text-ink">
        <SiteHeader
          user={user ? { name: user.name, email: user.email, role } : null}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter authenticated={user !== null} />
      </body>
    </html>
  );
}
