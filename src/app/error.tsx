"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold tracking-wide text-royal uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-bold text-navy sm:text-4xl">
        We hit an unexpected error
      </h1>
      <p className="mt-3 text-slate-600">
        Please try again. If the problem continues, contact support with the
        reference below.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-slate-400">
          Reference: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-xl bg-royal px-5 py-2.5 font-semibold text-white shadow-soft transition hover:bg-royal-600"
      >
        Try again
      </button>
    </div>
  );
}
