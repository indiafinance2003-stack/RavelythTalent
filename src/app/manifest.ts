import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ravelyth Talent',
    short_name: 'Ravelyth Talent',
    description:
      'Ravelyth Talent connects great people with great opportunities. Browse live jobs, build a profile and resume, apply in one click, and hire with recruiter plans.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1220',
    theme_color: '#0b1220',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}