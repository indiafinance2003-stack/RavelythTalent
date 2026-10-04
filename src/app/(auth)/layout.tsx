import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-offwhite">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="decor-circle -top-28 -left-20 h-80 w-80 bg-mint-tint" />
        <span className="decor-circle -right-24 bottom-0 h-72 w-72 bg-sky-tint" />
      </div>

      <header className="relative z-10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo />
          <Link
            href="/jobs"
            className="text-sm font-semibold text-navy hover:text-royal"
          >
            Browse jobs
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative z-10 flex-1 px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-lg py-6 sm:py-10">{children}</div>
      </main>

      <footer className="relative z-10 px-4 pb-8 text-center sm:px-6">
        <p className="text-xs text-slate-500">
          Right People | Better Opportunities | Stronger Tomorrow
        </p>
      </footer>
    </div>
  );
}