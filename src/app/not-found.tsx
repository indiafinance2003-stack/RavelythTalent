import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <Logo />
      <p className="mt-8 text-sm font-semibold tracking-wide text-royal uppercase">
        Error 404
      </p>
      <h1 className="mt-2 text-3xl font-bold text-navy sm:text-4xl">
        We could not find that page
      </h1>
      <p className="mt-3 text-slate-600">
        The link may be broken, or the job or page may have been removed.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-royal px-5 py-2.5 font-semibold text-white shadow-soft transition hover:bg-royal-600"
        >
          Back to home
        </Link>
        <Link
          href="/jobs"
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 font-semibold text-navy transition hover:bg-slate-50"
        >
          Browse jobs
        </Link>
      </div>
    </div>
  );
}
