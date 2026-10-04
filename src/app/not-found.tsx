import Link from 'next/link';

export default function NotFound(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-accent">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-3 text-lg text-muted">
        That URL is not part of Ravelyth Talent. The page may have moved or never existed.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Back to home
        </Link>
        <Link
          href="/jobs"
          className="rounded-md border border-line bg-navy-surface px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
        >
          Browse jobs
        </Link>
      </div>
    </div>
  );
}
